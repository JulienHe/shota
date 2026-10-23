//! `.shota` project files: a capture with everything done to it, in one file.
//!
//! A history entry keeps the original picture and the edits separately, which
//! is right for a cache but no use for handing the work to someone else, or
//! keeping it past the history limit. A project file puts the two together:
//! the original picture, and the document (shapes, frame, and the crops and
//! turns made to the picture) exactly as the editor saves it. Opening one
//! gives back the editor as it was left, every shape still editable.
//!
//! It is JSON with the picture as base64, so it is readable, diff-able and
//! survives being mailed; at the cost of a third more bytes than a binary
//! container would take. Screenshots are small next to that convenience.

use base64::Engine;
use serde::{Deserialize, Serialize};

/// The extension, without the dot.
pub const EXTENSION: &str = "shota";

const FORMAT: &str = "shota-project";
/// Bumped only when a file this version writes could not be read by an older
/// one; readers accept anything up to the version they know.
const VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct ProjectFile {
    format: String,
    version: u32,
    /// The original capture, PNG, base64.
    image: String,
    /// The editor's saved document, as JSON. Kept as a value so its own
    /// versioning (shapes, frame, image edits) stays the editor's business.
    document: serde_json::Value,
    #[serde(default)]
    app_version: Option<String>,
}

/// The text of a project file for `png` and the editor's `document_json`.
pub fn build(png: &[u8], document_json: &str, app_version: &str) -> Result<String, String> {
    let document: serde_json::Value =
        serde_json::from_str(document_json).map_err(|e| format!("the document is not valid: {e}"))?;
    let file = ProjectFile {
        format: FORMAT.to_string(),
        version: VERSION,
        image: base64::engine::general_purpose::STANDARD.encode(png),
        document,
        app_version: Some(app_version.to_string()),
    };
    serde_json::to_string(&file).map_err(|e| e.to_string())
}

/// The original picture and the document's JSON out of a project file's text.
pub fn parse(text: &str) -> Result<(Vec<u8>, String), String> {
    let file: ProjectFile = serde_json::from_str(text).map_err(|_| "not a Shota project file".to_string())?;
    if file.format != FORMAT {
        return Err("not a Shota project file".to_string());
    }
    if file.version > VERSION {
        return Err("this project was made by a newer Shota".to_string());
    }
    let png = base64::engine::general_purpose::STANDARD
        .decode(file.image)
        .map_err(|_| "the picture in this project is damaged".to_string())?;
    Ok((png, file.document.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOCUMENT: &str =
        r#"{"version":3,"shapes":[{"id":"a","type":"arrow"}],"frame":null,"imageOps":[{"op":"rotate","turns":1}]}"#;

    #[test]
    fn a_project_comes_back_as_it_went_in() {
        let png = crate::capture::encode_png(image::RgbaImage::new(4, 3)).unwrap();
        let text = build(&png, DOCUMENT, "0.10.0").unwrap();
        let (back, document) = parse(&text).unwrap();
        assert_eq!(back, png);
        let original: serde_json::Value = serde_json::from_str(DOCUMENT).unwrap();
        let returned: serde_json::Value = serde_json::from_str(&document).unwrap();
        assert_eq!(original, returned);
    }

    #[test]
    fn something_else_is_refused() {
        assert!(parse("{}").is_err());
        assert!(parse("not json").is_err());
        assert!(parse(r#"{"format":"other","version":1,"image":"","document":{}}"#).is_err());
    }

    #[test]
    fn a_newer_project_is_refused_not_misread() {
        let text = r#"{"format":"shota-project","version":99,"image":"","document":{}}"#;
        assert_eq!(parse(text).unwrap_err(), "this project was made by a newer Shota");
    }

    #[test]
    fn a_damaged_picture_is_reported() {
        let text = r#"{"format":"shota-project","version":1,"image":"!!!","document":{}}"#;
        assert_eq!(parse(text).unwrap_err(), "the picture in this project is damaged");
    }

    #[test]
    fn a_document_that_is_not_json_is_not_written() {
        assert!(build(&[1, 2, 3], "{oops", "0.10.0").is_err());
    }
}
