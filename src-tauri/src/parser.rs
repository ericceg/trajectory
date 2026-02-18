use std::{fs::File, io::BufReader, path::Path};

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use quick_xml::{events::Event, Reader};

use crate::models::{ActivitySample, ParsedActivity, TrackPoint};

const MAX_UI_POINTS: usize = 2000;

#[derive(Debug, Default, Clone)]
struct RawTrackPoint {
    time: Option<DateTime<Utc>>,
    lat: Option<f64>,
    lon: Option<f64>,
    altitude: Option<f64>,
    heart_rate: Option<f64>,
    distance: Option<f64>,
    speed: Option<f64>,
}

fn normalize_tag(bytes: &[u8]) -> String {
    let tag = String::from_utf8_lossy(bytes).to_string();
    tag.rsplit(':').next().unwrap_or(&tag).to_string()
}

fn parse_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn parse_f64(value: &str) -> Option<f64> {
    value.parse::<f64>().ok()
}

fn haversine_m(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6_371_000.0_f64;
    let lat1r = lat1.to_radians();
    let lat2r = lat2.to_radians();
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();

    let a = (dlat / 2.0).sin().powi(2) + lat1r.cos() * lat2r.cos() * (dlon / 2.0).sin().powi(2);

    2.0 * r * a.sqrt().atan2((1.0 - a).sqrt())
}

fn downsample<T: Clone>(items: &[T], max: usize) -> Vec<T> {
    if items.len() <= max {
        return items.to_vec();
    }

    if max <= 1 {
        return vec![items[items.len() - 1].clone()];
    }

    let stride = ((items.len() - 1) as f64 / (max - 1) as f64).ceil() as usize;
    let mut output = Vec::with_capacity(max);
    let mut index = 0;

    while index < items.len() - 1 && output.len() < max - 1 {
        output.push(items[index].clone());
        index += stride;
    }

    output.push(items[items.len() - 1].clone());
    output
}

pub fn parse_tcx_file(path: &Path) -> Result<ParsedActivity> {
    let file =
        File::open(path).with_context(|| format!("failed to open TCX file {}", path.display()))?;
    let mut reader = Reader::from_reader(BufReader::new(file));
    reader.config_mut().trim_text(true);

    let mut buf = Vec::<u8>::new();
    let mut current_tag = String::new();

    let mut sport_type = String::from("Other");
    let mut activity_start: Option<DateTime<Utc>> = None;

    let mut in_trackpoint = false;
    let mut in_position = false;
    let mut in_heart_rate = false;
    let mut in_lap = false;

    let mut lap_distance_total = 0.0;
    let mut lap_duration_total = 0.0;

    let mut current_point = RawTrackPoint::default();
    let mut points: Vec<RawTrackPoint> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let tag = normalize_tag(e.name().as_ref());

                if tag == "Activity" {
                    for attr in e.attributes().flatten() {
                        if normalize_tag(attr.key.as_ref()) == "Sport" {
                            sport_type = String::from_utf8_lossy(attr.value.as_ref()).to_string();
                        }
                    }
                }

                if tag == "Lap" {
                    in_lap = true;
                    if activity_start.is_none() {
                        for attr in e.attributes().flatten() {
                            if normalize_tag(attr.key.as_ref()) == "StartTime" {
                                let value =
                                    String::from_utf8_lossy(attr.value.as_ref()).to_string();
                                activity_start = parse_time(&value);
                            }
                        }
                    }
                }

                if tag == "Trackpoint" {
                    in_trackpoint = true;
                    current_point = RawTrackPoint::default();
                }

                if tag == "Position" {
                    in_position = true;
                }

                if tag == "HeartRateBpm" {
                    in_heart_rate = true;
                }

                current_tag = tag;
            }
            Ok(Event::Text(e)) => {
                let value = String::from_utf8_lossy(e.as_ref()).trim().to_string();

                if value.is_empty() {
                    buf.clear();
                    continue;
                }

                if in_trackpoint {
                    match current_tag.as_str() {
                        "Time" => current_point.time = parse_time(&value),
                        "LatitudeDegrees" if in_position => current_point.lat = parse_f64(&value),
                        "LongitudeDegrees" if in_position => current_point.lon = parse_f64(&value),
                        "AltitudeMeters" => current_point.altitude = parse_f64(&value),
                        "DistanceMeters" => current_point.distance = parse_f64(&value),
                        "Speed" => current_point.speed = parse_f64(&value),
                        "Value" if in_heart_rate => current_point.heart_rate = parse_f64(&value),
                        _ => {}
                    }
                } else {
                    match current_tag.as_str() {
                        "Id" if activity_start.is_none() => activity_start = parse_time(&value),
                        "TotalTimeSeconds" if in_lap => {
                            if let Some(v) = parse_f64(&value) {
                                lap_duration_total += v;
                            }
                        }
                        "DistanceMeters" if in_lap => {
                            if let Some(v) = parse_f64(&value) {
                                lap_distance_total += v;
                            }
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                let tag = normalize_tag(e.name().as_ref());

                if tag == "Trackpoint" {
                    in_trackpoint = false;
                    points.push(current_point.clone());
                }

                if tag == "Position" {
                    in_position = false;
                }

                if tag == "HeartRateBpm" {
                    in_heart_rate = false;
                }

                if tag == "Lap" {
                    in_lap = false;
                }

                current_tag.clear();
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(err) => {
                return Err(anyhow!(
                    "failed to parse XML in {}: {}",
                    path.display(),
                    err
                ));
            }
        }

        buf.clear();
    }

    if points.is_empty() {
        return Err(anyhow!("no trackpoints in {}", path.display()));
    }

    let first_time = points.iter().find_map(|point| point.time.as_ref().cloned());
    let last_time = points
        .iter()
        .rev()
        .find_map(|point| point.time.as_ref().cloned());

    let start_time = activity_start
        .or(first_time)
        .ok_or_else(|| anyhow!("missing activity start time in {}", path.display()))?;

    let duration_seconds = match (first_time, last_time) {
        (Some(start), Some(end)) if end >= start => {
            (end - start).num_milliseconds() as f64 / 1000.0
        }
        _ => lap_duration_total.max(0.0),
    };

    let mut gps_distance_accum = 0.0;
    let mut previous_gps: Option<(f64, f64)> = None;
    let mut has_gps = false;

    let mut first_reported_distance: Option<f64> = None;
    let mut last_reported_distance: Option<f64> = None;

    let mut elevation_gain = 0.0;
    let mut previous_altitude: Option<f64> = None;

    let mut heart_rate_values: Vec<f64> = Vec::new();
    let mut speed_values: Vec<f64> = Vec::new();

    let mut previous_elapsed: Option<f64> = None;
    let mut previous_distance: Option<f64> = None;

    let mut raw_samples: Vec<ActivitySample> = Vec::with_capacity(points.len());
    let mut raw_track: Vec<TrackPoint> = Vec::with_capacity(points.len());

    for point in &points {
        if let (Some(lat), Some(lon)) = (point.lat, point.lon) {
            has_gps = true;

            if let Some((prev_lat, prev_lon)) = previous_gps {
                gps_distance_accum += haversine_m(prev_lat, prev_lon, lat, lon);
            }
            previous_gps = Some((lat, lon));
            raw_track.push(TrackPoint { lat, lon });
        }

        if let Some(distance) = point.distance {
            if first_reported_distance.is_none() {
                first_reported_distance = Some(distance);
            }
            let relative = distance - first_reported_distance.unwrap_or(distance);
            last_reported_distance = Some(relative.max(0.0));
        }

        if let (Some(prev_alt), Some(current_alt)) = (previous_altitude, point.altitude) {
            let delta = current_alt - prev_alt;
            if delta > 1.0 {
                elevation_gain += delta;
            }
        }

        if point.altitude.is_some() {
            previous_altitude = point.altitude;
        }

        if let Some(hr) = point.heart_rate {
            heart_rate_values.push(hr);
        }

        let elapsed = point
            .time
            .as_ref()
            .map(|time| (*time - start_time).num_milliseconds() as f64 / 1000.0)
            .unwrap_or(0.0)
            .max(0.0);

        let distance_m = point
            .distance
            .and_then(|distance| first_reported_distance.map(|first| (distance - first).max(0.0)))
            .or_else(|| {
                if has_gps {
                    Some(gps_distance_accum)
                } else {
                    None
                }
            });

        let derived_speed = if let Some(speed) = point.speed {
            Some(speed)
        } else if let (Some(prev_elapsed), Some(prev_distance), Some(distance_m)) =
            (previous_elapsed, previous_distance, distance_m)
        {
            let dt = elapsed - prev_elapsed;
            if dt > 0.1 {
                Some(((distance_m - prev_distance) / dt).max(0.0))
            } else {
                None
            }
        } else {
            None
        };

        if let Some(speed) = derived_speed {
            speed_values.push(speed);
        }

        raw_samples.push(ActivitySample {
            elapsed_seconds: elapsed,
            distance_m,
            speed_mps: derived_speed,
            heart_rate: point.heart_rate,
            altitude_m: point.altitude,
            lat: point.lat,
            lon: point.lon,
            timestamp: point.time.as_ref().map(|time| time.to_rfc3339()),
        });

        previous_elapsed = Some(elapsed);
        previous_distance = distance_m;
    }

    let distance_m = last_reported_distance
        .or_else(|| {
            if gps_distance_accum > 0.0 {
                Some(gps_distance_accum)
            } else {
                None
            }
        })
        .unwrap_or(lap_distance_total.max(0.0));

    let avg_speed_mps = if duration_seconds > 0.1 && distance_m > 0.0 {
        Some(distance_m / duration_seconds)
    } else if !speed_values.is_empty() {
        Some(speed_values.iter().sum::<f64>() / speed_values.len() as f64)
    } else {
        None
    };

    let max_speed_mps = speed_values.into_iter().reduce(f64::max);

    let avg_hr = if heart_rate_values.is_empty() {
        None
    } else {
        Some(heart_rate_values.iter().sum::<f64>() / heart_rate_values.len() as f64)
    };

    let max_hr = heart_rate_values.into_iter().reduce(f64::max);

    let sampled_track = downsample(&raw_track, MAX_UI_POINTS);
    let sampled_samples = downsample(&raw_samples, MAX_UI_POINTS);

    Ok(ParsedActivity {
        start_time: start_time.to_rfc3339(),
        sport_type,
        duration_seconds: duration_seconds.max(0.0),
        distance_m: distance_m.max(0.0),
        elevation_gain_m: elevation_gain.max(0.0),
        avg_speed_mps,
        max_speed_mps,
        avg_hr,
        max_hr,
        has_gps,
        track: sampled_track,
        samples: sampled_samples,
        original_sample_count: points.len(),
    })
}
