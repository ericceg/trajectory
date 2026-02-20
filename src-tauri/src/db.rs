use std::{collections::HashMap, path::Path};

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::models::{
    ActivityDetail, ActivityFilters, ActivitySample, ActivitySummary, ParsedActivity, SourceFileMeta,
    TrackPoint,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpsertResult {
    Added,
    Updated,
}

pub fn open_connection(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)
        .with_context(|| format!("failed opening sqlite database {}", db_path.display()))?;

    conn.execute_batch(
        r#"
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    "#,
    )?;

    Ok(conn)
}

pub fn init_db(db_path: &Path) -> Result<()> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed creating db directory {}", parent.display()))?;
    }

    let conn = open_connection(db_path)?;
    conn.execute_batch(
        r#"
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL UNIQUE,
      source_mtime INTEGER NOT NULL,
      source_size INTEGER NOT NULL,
      activity_start TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      sport_type TEXT NOT NULL,
      duration_seconds REAL NOT NULL,
      distance_m REAL NOT NULL,
      elevation_gain_m REAL NOT NULL,
      avg_speed_mps REAL,
      max_speed_mps REAL,
      avg_hr REAL,
      max_hr REAL,
      has_gps INTEGER NOT NULL,
      track_json TEXT NOT NULL,
      original_sample_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_activities_start ON activities(activity_start);
    CREATE INDEX IF NOT EXISTS idx_activities_sport ON activities(sport_type);

    CREATE TABLE IF NOT EXISTS activity_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      elapsed_seconds REAL NOT NULL,
      distance_m REAL,
      speed_mps REAL,
      heart_rate REAL,
      altitude_m REAL,
      lat REAL,
      lon REAL,
      sample_time TEXT,
      FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_samples_activity_id ON activity_samples(activity_id);
    "#,
    )?;

    ensure_activity_category_column(&conn)?;

    Ok(())
}

fn ensure_activity_category_column(conn: &Connection) -> Result<()> {
    let has_category = conn
        .query_row(
            "SELECT 1 FROM pragma_table_info('activities') WHERE name = 'category' LIMIT 1",
            [],
            |_| Ok(()),
        )
        .optional()?
        .is_some();

    if !has_category {
        conn.execute(
            "ALTER TABLE activities ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'",
            [],
        )?;
    }

    conn.execute_batch(
        r#"
    UPDATE activities
    SET category = CASE
      WHEN lower(sport_type) LIKE '%run%' OR lower(sport_type) LIKE '%jog%' THEN 'Running'
      WHEN lower(sport_type) LIKE '%bik%' OR lower(sport_type) LIKE '%cycl%' OR lower(sport_type) LIKE '%ride%' OR lower(sport_type) LIKE '%spin%' THEN 'Biking'
      WHEN lower(sport_type) LIKE '%hike%' THEN 'Hiking'
      WHEN lower(sport_type) LIKE '%walk%' THEN 'Walking'
      WHEN lower(sport_type) LIKE '%swim%' THEN 'Swimming'
      WHEN lower(sport_type) LIKE '%row%' THEN 'Rowing'
      WHEN lower(sport_type) LIKE '%strength%' OR lower(sport_type) LIKE '%gym%' THEN 'Strength'
      WHEN lower(sport_type) LIKE '%yoga%' OR lower(sport_type) LIKE '%pilates%' THEN 'Mobility'
      ELSE COALESCE(NULLIF(category, ''), 'Other')
    END;

    CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);
    "#,
    )?;

    Ok(())
}

pub fn source_file_meta_map(conn: &Connection) -> Result<HashMap<String, SourceFileMeta>> {
    let mut stmt = conn.prepare("SELECT source_path, source_mtime, source_size FROM activities")?;

    let mut map = HashMap::new();
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            SourceFileMeta {
                source_mtime: row.get(1)?,
                source_size: row.get(2)?,
            },
        ))
    })?;

    for row in rows {
        let (path, meta) = row?;
        map.insert(path, meta);
    }

    Ok(map)
}

pub fn delete_activity_by_source_path(conn: &Connection, source_path: &str) -> Result<usize> {
    let deleted = conn.execute(
        "DELETE FROM activities WHERE source_path = ?1",
        params![source_path],
    )?;
    Ok(deleted)
}

pub fn clear_activity_cache(conn: &mut Connection) -> Result<()> {
    let transaction = conn.transaction()?;
    transaction.execute("DELETE FROM activity_samples", [])?;
    transaction.execute("DELETE FROM activities", [])?;
    transaction.commit()?;
    Ok(())
}

pub fn upsert_activity(
    conn: &mut Connection,
    source_path: &str,
    source_mtime: i64,
    source_size: i64,
    parsed: &ParsedActivity,
) -> Result<UpsertResult> {
    let existing_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM activities WHERE source_path = ?1",
            params![source_path],
            |row| row.get(0),
        )
        .optional()?;

    let track_json = serde_json::to_string(&parsed.track)?;

    conn.execute(
        r#"
    INSERT INTO activities (
      source_path,
      source_mtime,
      source_size,
      activity_start,
      category,
      sport_type,
      duration_seconds,
      distance_m,
      elevation_gain_m,
      avg_speed_mps,
      max_speed_mps,
      avg_hr,
      max_hr,
      has_gps,
      track_json,
      original_sample_count,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, CURRENT_TIMESTAMP)
    ON CONFLICT(source_path) DO UPDATE SET
      source_mtime = excluded.source_mtime,
      source_size = excluded.source_size,
      activity_start = excluded.activity_start,
      category = excluded.category,
      sport_type = excluded.sport_type,
      duration_seconds = excluded.duration_seconds,
      distance_m = excluded.distance_m,
      elevation_gain_m = excluded.elevation_gain_m,
      avg_speed_mps = excluded.avg_speed_mps,
      max_speed_mps = excluded.max_speed_mps,
      avg_hr = excluded.avg_hr,
      max_hr = excluded.max_hr,
      has_gps = excluded.has_gps,
      track_json = excluded.track_json,
      original_sample_count = excluded.original_sample_count,
      updated_at = CURRENT_TIMESTAMP
    "#,
        params![
            source_path,
            source_mtime,
            source_size,
            &parsed.start_time,
            &parsed.category,
            &parsed.sport_type,
            parsed.duration_seconds,
            parsed.distance_m,
            parsed.elevation_gain_m,
            parsed.avg_speed_mps,
            parsed.max_speed_mps,
            parsed.avg_hr,
            parsed.max_hr,
            if parsed.has_gps { 1 } else { 0 },
            track_json,
            parsed.original_sample_count as i64,
        ],
    )?;

    let activity_id: i64 = conn.query_row(
        "SELECT id FROM activities WHERE source_path = ?1",
        params![source_path],
        |row| row.get(0),
    )?;

    let transaction = conn.transaction()?;
    transaction.execute(
        "DELETE FROM activity_samples WHERE activity_id = ?1",
        params![activity_id],
    )?;

    {
        let mut insert_stmt = transaction.prepare(
            r#"
      INSERT INTO activity_samples (
        activity_id,
        elapsed_seconds,
        distance_m,
        speed_mps,
        heart_rate,
        altitude_m,
        lat,
        lon,
        sample_time
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      "#,
        )?;

        for sample in &parsed.samples {
            insert_stmt.execute(params![
                activity_id,
                sample.elapsed_seconds,
                sample.distance_m,
                sample.speed_mps,
                sample.heart_rate,
                sample.altitude_m,
                sample.lat,
                sample.lon,
                sample.timestamp,
            ])?;
        }
    }

    transaction.commit()?;

    Ok(if existing_id.is_some() {
        UpsertResult::Updated
    } else {
        UpsertResult::Added
    })
}

fn map_summary_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivitySummary> {
    Ok(ActivitySummary {
        id: row.get(0)?,
        source_path: row.get(1)?,
        activity_start: row.get(2)?,
        category: row.get(3)?,
        sport_type: row.get(4)?,
        duration_seconds: row.get(5)?,
        distance_m: row.get(6)?,
        elevation_gain_m: row.get(7)?,
        avg_speed_mps: row.get(8)?,
        max_speed_mps: row.get(9)?,
        avg_hr: row.get(10)?,
        max_hr: row.get(11)?,
        has_gps: row.get::<_, i64>(12)? == 1,
    })
}

pub fn list_activities(
    conn: &Connection,
    filters: &ActivityFilters,
) -> Result<Vec<ActivitySummary>> {
    let mut stmt = conn.prepare(
        r#"
    SELECT
      id,
      source_path,
      activity_start,
      category,
      sport_type,
      duration_seconds,
      distance_m,
      elevation_gain_m,
      avg_speed_mps,
      max_speed_mps,
      avg_hr,
      max_hr,
      has_gps
    FROM activities
    WHERE (?1 IS NULL OR date(activity_start) >= date(?1))
      AND (?2 IS NULL OR date(activity_start) <= date(?2))
      AND (?3 IS NULL OR category = ?3)
      AND (?4 IS NULL OR sport_type = ?4)
      AND (?5 IS NULL OR distance_m >= ?5)
      AND (?6 IS NULL OR distance_m <= ?6)
      AND (?7 IS NULL OR date(activity_start) = date(?7))
    ORDER BY activity_start DESC
    "#,
    )?;

    let rows = stmt.query_map(
        params![
            filters.start_date.as_deref(),
            filters.end_date.as_deref(),
            filters.category.as_deref(),
            filters.sport_type.as_deref(),
            filters.min_distance,
            filters.max_distance,
            filters.day.as_deref(),
        ],
        map_summary_row,
    )?;

    let mut activities = Vec::new();
    for row in rows {
        activities.push(row?);
    }

    Ok(activities)
}

pub fn get_activity(conn: &Connection, id: i64) -> Result<ActivityDetail> {
    let mut stmt = conn.prepare(
        r#"
    SELECT
      id,
      source_path,
      activity_start,
      category,
      sport_type,
      duration_seconds,
      distance_m,
      elevation_gain_m,
      avg_speed_mps,
      max_speed_mps,
      avg_hr,
      max_hr,
      has_gps,
      track_json,
      original_sample_count
    FROM activities
    WHERE id = ?1
    "#,
    )?;

    let (summary, track_json, original_sample_count): (ActivitySummary, String, i64) = stmt
        .query_row(params![id], |row| {
            Ok((
                ActivitySummary {
                    id: row.get(0)?,
                    source_path: row.get(1)?,
                    activity_start: row.get(2)?,
                    category: row.get(3)?,
                    sport_type: row.get(4)?,
                    duration_seconds: row.get(5)?,
                    distance_m: row.get(6)?,
                    elevation_gain_m: row.get(7)?,
                    avg_speed_mps: row.get(8)?,
                    max_speed_mps: row.get(9)?,
                    avg_hr: row.get(10)?,
                    max_hr: row.get(11)?,
                    has_gps: row.get::<_, i64>(12)? == 1,
                },
                row.get(13)?,
                row.get(14)?,
            ))
        })
        .optional()?
        .ok_or_else(|| anyhow!("activity {} not found", id))?;

    let track: Vec<TrackPoint> = serde_json::from_str(&track_json).unwrap_or_default();

    let mut sample_stmt = conn.prepare(
        r#"
    SELECT elapsed_seconds, distance_m, speed_mps, heart_rate, altitude_m, lat, lon, sample_time
    FROM activity_samples
    WHERE activity_id = ?1
    ORDER BY elapsed_seconds ASC
    "#,
    )?;

    let sample_rows = sample_stmt.query_map(params![id], |row| {
        Ok(ActivitySample {
            elapsed_seconds: row.get(0)?,
            distance_m: row.get(1)?,
            speed_mps: row.get(2)?,
            heart_rate: row.get(3)?,
            altitude_m: row.get(4)?,
            lat: row.get(5)?,
            lon: row.get(6)?,
            timestamp: row.get(7)?,
        })
    })?;

    let mut samples = Vec::new();
    for sample in sample_rows {
        samples.push(sample?);
    }

    Ok(ActivityDetail {
        summary,
        track,
        samples,
        original_sample_count: original_sample_count as usize,
    })
}
