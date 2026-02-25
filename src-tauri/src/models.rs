use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub import_folder_path: Option<String>,
    pub scan_recursive: bool,
    pub last_scan_timestamp: Option<String>,
    pub dark_mode: bool,
    pub accent_theme: String,
    pub heatmap_full_opacity: bool,
    pub chart_max_samples: usize,
    pub heart_rate_zone_upper_bounds_bpm: Vec<u16>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            import_folder_path: None,
            scan_recursive: true,
            last_scan_timestamp: None,
            dark_mode: false,
            accent_theme: "strava-orange".to_string(),
            heatmap_full_opacity: false,
            chart_max_samples: 2000,
            heart_rate_zone_upper_bounds_bpm: vec![120, 140, 160, 180],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityFilters {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub category: Option<String>,
    pub sport_type: Option<String>,
    pub min_distance: Option<f64>,
    pub max_distance: Option<f64>,
    pub day: Option<String>,
}

impl Default for ActivityFilters {
    fn default() -> Self {
        Self {
            start_date: None,
            end_date: None,
            category: None,
            sport_type: None,
            min_distance: None,
            max_distance: None,
            day: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySummary {
    pub id: i64,
    pub source_path: String,
    pub activity_start: String,
    pub title: String,
    pub category: String,
    pub sport_type: String,
    pub duration_seconds: f64,
    pub moving_duration_seconds: f64,
    pub distance_m: f64,
    pub elevation_gain_m: f64,
    pub avg_speed_mps: Option<f64>,
    pub max_speed_mps: Option<f64>,
    pub avg_hr: Option<f64>,
    pub min_hr: Option<f64>,
    pub max_hr: Option<f64>,
    pub has_gps: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackPoint {
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySample {
    pub elapsed_seconds: f64,
    pub distance_m: Option<f64>,
    pub speed_mps: Option<f64>,
    pub heart_rate: Option<f64>,
    pub cadence: Option<f64>,
    pub power_watts: Option<f64>,
    pub altitude_m: Option<f64>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDetail {
    pub summary: ActivitySummary,
    pub track: Vec<TrackPoint>,
    pub original_sample_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySampleQuery {
    pub distance_min_km: Option<f64>,
    pub distance_max_km: Option<f64>,
    pub max_samples: Option<usize>,
}

impl Default for ActivitySampleQuery {
    fn default() -> Self {
        Self {
            distance_min_km: None,
            distance_max_km: None,
            max_samples: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySamplesResponse {
    pub samples: Vec<ActivitySample>,
    pub original_sample_count: usize,
    pub matching_sample_count: usize,
    pub returned_sample_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapFilters {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub category: Option<String>,
    pub sport_type: Option<String>,
    pub activity_ids: Option<Vec<i64>>,
    pub max_points: Option<usize>,
}

impl Default for HeatmapFilters {
    fn default() -> Self {
        Self {
            start_date: None,
            end_date: None,
            category: None,
            sport_type: None,
            activity_ids: None,
            max_points: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapData {
    pub tracks: Vec<Vec<TrackPoint>>,
    pub activity_count: usize,
    pub original_point_count: usize,
    pub returned_point_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressEvent {
    pub parsed: usize,
    pub total: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanDoneEvent {
    pub added: usize,
    pub updated: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ParsedActivity {
    pub start_time: String,
    pub title: String,
    pub category: String,
    pub sport_type: String,
    pub duration_seconds: f64,
    pub moving_duration_seconds: f64,
    pub distance_m: f64,
    pub elevation_gain_m: f64,
    pub avg_speed_mps: Option<f64>,
    pub max_speed_mps: Option<f64>,
    pub avg_hr: Option<f64>,
    pub min_hr: Option<f64>,
    pub max_hr: Option<f64>,
    pub has_gps: bool,
    pub track: Vec<TrackPoint>,
    pub samples: Vec<ActivitySample>,
    pub original_sample_count: usize,
}

#[derive(Debug, Clone)]
pub struct SourceFileMeta {
    pub source_mtime: i64,
    pub source_size: i64,
}
