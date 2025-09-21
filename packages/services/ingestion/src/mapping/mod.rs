use serde_json::Value;
use std::collections::HashMap;
use chrono::TimeZone;

use crate::models::*;

pub struct FieldMapper {
    // Transform functions registry
    transforms: HashMap<String, Box<dyn Fn(&Value, Option<&Value>) -> Result<Value> + Send + Sync>>,
}

impl FieldMapper {
    pub fn new() -> Self {
        let mut mapper = Self {
            transforms: HashMap::new(),
        };
        
        // Register built-in transform functions
        mapper.register_builtin_transforms();
        mapper
    }

    pub fn map_fields(&self, source_data: &Value, mapping: &FieldMapping) -> Result<Value> {
        let mut output = serde_json::Map::new();

        // Apply field mappings
        for (target_field, rule) in &mapping.fields {
            // Support alternative paths using '|' separator (first non-empty wins)
            let mut source_value = self.extract_first_non_empty_by_alt_paths(source_data, &rule.source_path)?;

            // Built-in fallbacks for common fields when still empty
            if self.is_empty_value(&source_value) {
                match target_field.as_str() {
                    // Price aliases commonly seen across feeds
                    "price" => {
                        let price_aliases = [
                            "sale_price",
                            "retail_price",
                            "price_usd",
                            "msrp",
                            "list_price",
                            "current_price",
                            "amount",
                            "price_value",
                        ];
                        for p in &price_aliases {
                            let v = self.extract_value_by_path(source_data, p)?;
                            if !self.is_empty_value(&v) { source_value = v; break; }
                        }
                    }
                    // Categories aliases
                    "categories" => {
                        let cat_aliases = ["category", "department", "category_path", "categoryPath"];
                        for p in &cat_aliases {
                            let v = self.extract_value_by_path(source_data, p)?;
                            if !self.is_empty_value(&v) { source_value = v; break; }
                        }
                    }
                    _ => {}
                }
            }
            
            let mapped_value = if let Some(transform) = &rule.transform {
                self.apply_transform(&source_value, transform)?
            } else {
                self.convert_data_type(&source_value, &rule.data_type)?
            };

            // Handle empties w.r.t required flag
            if self.is_empty_value(&mapped_value) {
                if rule.required {
                    // Signal mapping error for required fields; engine will translate into ValidationError
                    return Err(IngestionError::Validation(format!(
                        "Missing required field '{}' from source path '{}'",
                        target_field, rule.source_path
                    )));
                } else {
                    // Non-required empties are included as null to preserve field presence
                    output.insert(target_field.clone(), Value::Null);
                    continue;
                }
            }

            output.insert(target_field.clone(), mapped_value);
        }

        Ok(Value::Object(output))
    }

    fn extract_first_non_empty_by_alt_paths(&self, data: &Value, path_expr: &str) -> Result<Value> {
        // Allow 'a|b|c' to represent alternatives
        if path_expr.contains('|') {
            for part in path_expr.split('|').map(|s| s.trim()) {
                if part.is_empty() { continue; }
                let v = self.extract_value_by_path(data, part)?;
                if !self.is_empty_value(&v) {
                    return Ok(v);
                }
            }
            return Ok(Value::Null);
        }
        self.extract_value_by_path(data, path_expr)
    }

    fn extract_value_by_path(&self, data: &Value, path: &str) -> Result<Value> {
        // Simple JSONPath-like extraction
        // For more complex scenarios, could use a proper JSONPath library
        let parts: Vec<&str> = path.split('.').collect();
        let mut current = data;

        for part in parts {
            if part.starts_with('[') && part.ends_with(']') {
                // Array index access
                if let Ok(index) = part[1..part.len()-1].parse::<usize>() {
                    if let Some(array) = current.as_array() {
                        current = array.get(index).unwrap_or(&Value::Null);
                    } else {
                        return Ok(Value::Null);
                    }
                }
            } else {
                // Object field access
                current = current.get(part).unwrap_or(&Value::Null);
            }
        }

        Ok(current.clone())
    }

    fn apply_transform(&self, value: &Value, transform: &TransformFunction) -> Result<Value> {
        if let Some(transform_fn) = self.transforms.get(&transform.function_name) {
            transform_fn(value, transform.parameters.as_ref())
        } else {
            Err(IngestionError::FieldMapping(format!(
                "Unknown transform function: {}",
                transform.function_name
            )))
        }
    }

    fn convert_data_type(&self, value: &Value, target_type: &DataType) -> Result<Value> {
        match target_type {
            DataType::String => Ok(Value::String(value.to_string().trim_matches('"').to_string())),
            DataType::Integer => {
                if let Some(num) = value.as_i64() {
                    Ok(Value::Number(num.into()))
                } else if let Some(s) = value.as_str() {
                    s.parse::<i64>()
                        .map(|n| Value::Number(n.into()))
                        .map_err(|_| IngestionError::FieldMapping(format!("Cannot convert '{}' to integer", s)))
                } else {
                    Ok(Value::Null)
                }
            },
            DataType::Float => {
                if let Some(num) = value.as_f64() {
                    Ok(serde_json::Number::from_f64(num)
                        .map(Value::Number)
                        .unwrap_or(Value::Null))
                } else if let Some(s) = value.as_str() {
                    match s.parse::<f64>() {
                        Ok(n) => serde_json::Number::from_f64(n)
                            .map(Value::Number)
                            .ok_or_else(|| IngestionError::FieldMapping(format!("Cannot convert '{}' to float", s))),
                        Err(_) => Err(IngestionError::FieldMapping(format!("Cannot convert '{}' to float", s))),
                    }
                } else {
                    Ok(Value::Null)
                }
            },
            DataType::Boolean => {
                if let Some(b) = value.as_bool() {
                    Ok(Value::Bool(b))
                } else if let Some(s) = value.as_str() {
                    match s.to_lowercase().as_str() {
                        "true" | "yes" | "1" | "on" => Ok(Value::Bool(true)),
                        "false" | "no" | "0" | "off" => Ok(Value::Bool(false)),
                        _ => Ok(Value::Bool(false)),
                    }
                } else {
                    Ok(Value::Bool(false))
                }
            },
            DataType::Array => {
                if value.is_array() {
                    Ok(value.clone())
                } else {
                    Ok(Value::Array(vec![value.clone()]))
                }
            },
            DataType::Object => {
                if value.is_object() {
                    Ok(value.clone())
                } else {
                    Ok(Value::Null)
                }
            },
            DataType::DateTime => {
                if let Some(s) = value.as_str() {
                    // Try to parse various date formats
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                        Ok(Value::String(dt.to_rfc3339()))
                    } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
                        let dt_with_tz = chrono::Utc.from_utc_datetime(&dt);
                        Ok(Value::String(dt_with_tz.to_rfc3339()))
                    } else {
                        Ok(value.clone()) // Keep original if parsing fails
                    }
                } else {
                    Ok(value.clone())
                }
            },
        }
    }

    pub fn is_empty_value(&self, value: &Value) -> bool {
        match value {
            Value::Null => true,
            Value::String(s) => s.trim().is_empty(),
            Value::Array(a) => a.is_empty(),
            Value::Object(o) => o.is_empty(),
            _ => false,
        }
    }

    fn register_builtin_transforms(&mut self) {
        // Uppercase transform
        self.transforms.insert(
            "uppercase".to_string(),
            Box::new(|value, _params| {
                if let Some(s) = value.as_str() {
                    Ok(Value::String(s.to_uppercase()))
                } else {
                    Ok(value.clone())
                }
            }),
        );

        // Lowercase transform
        self.transforms.insert(
            "lowercase".to_string(),
            Box::new(|value, _params| {
                if let Some(s) = value.as_str() {
                    Ok(Value::String(s.to_lowercase()))
                } else {
                    Ok(value.clone())
                }
            }),
        );

        // Trim transform
        self.transforms.insert(
            "trim".to_string(),
            Box::new(|value, _params| {
                if let Some(s) = value.as_str() {
                    Ok(Value::String(s.trim().to_string()))
                } else {
                    Ok(value.clone())
                }
            }),
        );

        // Default value transform
        self.transforms.insert(
            "default".to_string(),
            Box::new(|value, params| {
                if value.is_null() {
                    if let Some(default_val) = params {
                        Ok(default_val.clone())
                    } else {
                        Ok(Value::String("".to_string()))
                    }
                } else {
                    Ok(value.clone())
                }
            }),
        );

        // Split string transform
        self.transforms.insert(
            "split".to_string(),
            Box::new(|value, params| {
                if let Some(s) = value.as_str() {
                    let delimiter = params
                        .and_then(|p| p.get("delimiter"))
                        .and_then(|d| d.as_str())
                        .unwrap_or(",");
                    
                    let parts: Vec<Value> = s
                        .split(delimiter)
                        .map(|part| Value::String(part.trim().to_string()))
                        .collect();
                    
                    Ok(Value::Array(parts))
                } else {
                    Ok(value.clone())
                }
            }),
        );

        // Join array transform
        self.transforms.insert(
            "join".to_string(),
            Box::new(|value, params| {
                if let Some(arr) = value.as_array() {
                    let delimiter = params
                        .and_then(|p| p.get("delimiter"))
                        .and_then(|d| d.as_str())
                        .unwrap_or(",");
                    
                    let joined = arr
                        .iter()
                        .filter_map(|v| v.as_str())
                        .collect::<Vec<_>>()
                        .join(delimiter);
                    
                    Ok(Value::String(joined))
                } else {
                    Ok(value.clone())
                }
            }),
        );

        // Number formatting transform
        self.transforms.insert(
            "format_number".to_string(),
            Box::new(|value, params| {
                if let Some(num) = value.as_f64() {
                    let decimals = params
                        .and_then(|p| p.get("decimals"))
                        .and_then(|d| d.as_u64())
                        .unwrap_or(2) as usize;
                    
                    Ok(Value::String(format!("{:.decimals$}", num, decimals = decimals)))
                } else {
                    Ok(value.clone())
                }
            }),
        );

        // Regex replace transform
        self.transforms.insert(
            "regex_replace".to_string(),
            Box::new(|value, params| {
                if let (Some(s), Some(params)) = (value.as_str(), params) {
                    if let (Some(pattern), Some(replacement)) = (
                        params.get("pattern").and_then(|p| p.as_str()),
                        params.get("replacement").and_then(|r| r.as_str()),
                    ) {
                        // Simple regex replace - in production, might want to use regex crate
                        Ok(Value::String(s.replace(pattern, replacement)))
                    } else {
                        Ok(value.clone())
                    }
                } else {
                    Ok(value.clone())
                }
            }),
        );

        // To Bool transform (robust string/number → boolean)
        // Recognizes: true/false, yes/no, y/n, on/off, 1/0 (case-insensitive)
        // Numbers: non-zero => true, 0 => false
        // Booleans: pass-through
        // Others: Null
        let to_bool = Box::new(|value: &Value, _params: Option<&Value>| -> Result<Value> {
            if let Some(b) = value.as_bool() {
                return Ok(Value::Bool(b));
            }
            if let Some(n) = value.as_i64() {
                return Ok(Value::Bool(n != 0));
            }
            if let Some(f) = value.as_f64() {
                return Ok(Value::Bool(f != 0.0));
            }
            if let Some(s) = value.as_str() {
                let s = s.trim().to_lowercase();
                let b = match s.as_str() {
                    "true" | "t" | "yes" | "y" | "on" | "1" => Some(true),
                    "false" | "f" | "no" | "n" | "off" | "0" => Some(false),
                    _ => None,
                };
                if let Some(b) = b { return Ok(Value::Bool(b)); }
            }
            Ok(Value::Null)
        });
        self.transforms.insert("to_bool".to_string(), to_bool.clone());
        self.transforms.insert("to_boolean".to_string(), to_bool);

        // To Number transform (robust string → number)
        // - Handles currency symbols ($, €, £), spaces, and thousands separators
        // - Supports negatives in parentheses: (1,234.56) → -1234.56
        // - Attempts EU format: 1.234,56 → 1234.56
        // - Non-parseable inputs return Null (do not hard-fail the record)
        self.transforms.insert(
            "to_number".to_string(),
            Box::new(|value, _params| {
                // Pass-through numbers
                if let Some(n) = value.as_f64() {
                    return Ok(serde_json::Number::from_f64(n).map(Value::Number).unwrap_or(Value::Null));
                }
                if let Some(i) = value.as_i64() {
                    return Ok(Value::Number(i.into()));
                }

                let Some(mut s) = value.as_str().map(|v| v.trim().to_string()) else {
                    return Ok(Value::Null);
                };

                if s.is_empty() { return Ok(Value::Null); }

                // Handle negative via parentheses
                let mut negative_by_paren = false;
                if s.starts_with('(') && s.ends_with(')') {
                    negative_by_paren = true;
                    s = s.trim_start_matches('(').trim_end_matches(')').trim().to_string();
                }

                // Remove common currency symbols and spaces
                let mut cleaned: String = s
                    .chars()
                    .filter(|c| !matches!(c, ' ' | '\u{00A0}' | '$' | '€' | '£' | '¥' | '₩' | '₹'))
                    .collect();

                // Decide decimal/thousands strategy
                let has_dot = cleaned.contains('.');
                let has_comma = cleaned.contains(',');

                if has_dot && has_comma {
                    // Determine which is the decimal separator by the rightmost occurrence
                    let last_dot = cleaned.rfind('.');
                    let last_comma = cleaned.rfind(',');
                    if last_dot > last_comma { // US style: ',' thousands, '.' decimal
                        cleaned = cleaned.replace(',', "");
                    } else { // EU style: '.' thousands, ',' decimal
                        cleaned = cleaned.replace('.', "");
                        cleaned = cleaned.replace(',', ".");
                    }
                } else if has_comma && !has_dot {
                    // If single comma and fractional part looks like decimals (1-3 digits), treat as decimal
                    let treat_as_decimal = if let Some((_, frac)) = cleaned.rsplit_once(',') {
                        (1..=3).contains(&frac.len()) && frac.chars().all(|c| c.is_ascii_digit())
                    } else { false };
                    if treat_as_decimal {
                        cleaned = cleaned.replace(',', ".");
                    } else {
                        cleaned = cleaned.replace(',', "");
                    }
                } else {
                    // Only dot or neither: keep dot if present, strip non-numeric except sign and dot
                    cleaned = cleaned
                        .chars()
                        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-' || *c == '+')
                        .collect();
                }

                // Apply negative if parentheses indicated
                if negative_by_paren && !cleaned.starts_with('-') {
                    cleaned.insert(0, '-');
                }

                // Final parse
                match cleaned.parse::<f64>() {
                    Ok(n) => Ok(serde_json::Number::from_f64(n).map(Value::Number).unwrap_or(Value::Null)),
                    Err(_) => Ok(Value::Null),
                }
            }),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map_with_to_number(input: &str) -> Value {
        let mapper = FieldMapper::new();
        let mut fields = std::collections::HashMap::new();
        fields.insert(
            "price_num".to_string(),
            FieldMappingRule {
                source_path: "price".to_string(),
                target_field: "price_num".to_string(),
                data_type: DataType::Float,
                transform: Some(TransformFunction { function_name: "to_number".to_string(), parameters: None }),
                required: false,
            }
        );
        let mapping = FieldMapping { fields, embedding_fields: vec![], autocomplete_fields: vec![] };
        let source = serde_json::json!({ "price": input });
        mapper.map_fields(&source, &mapping).unwrap()
    }

    fn map_with_to_bool(input: Value) -> Value {
        let mapper = FieldMapper::new();
        let mut fields = std::collections::HashMap::new();
        fields.insert(
            "flag".to_string(),
            FieldMappingRule {
                source_path: "flag".to_string(),
                target_field: "flag".to_string(),
                data_type: DataType::Boolean,
                transform: Some(TransformFunction { function_name: "to_bool".to_string(), parameters: None }),
                required: false,
            }
        );
        let mapping = FieldMapping { fields, embedding_fields: vec![], autocomplete_fields: vec![] };
        let source = serde_json::json!({ "flag": input });
        mapper.map_fields(&source, &mapping).unwrap()
    }

    #[test]
    fn to_bool_truthy_values() {
        for s in ["true", "True", "YES", "y", "On", "1"] {
            let out = map_with_to_bool(Value::String(s.to_string()));
            assert_eq!(out.get("flag").and_then(|v| v.as_bool()), Some(true), "case {:?}", s);
        }
        // numeric
        let out = map_with_to_bool(Value::Number(5.into()));
        assert_eq!(out.get("flag").and_then(|v| v.as_bool()), Some(true));
    }

    #[test]
    fn to_bool_falsy_values() {
        for s in ["false", "False", "NO", "n", "Off", "0"] {
            let out = map_with_to_bool(Value::String(s.to_string()));
            assert_eq!(out.get("flag").and_then(|v| v.as_bool()), Some(false), "case {:?}", s);
        }
        // numeric
        let out = map_with_to_bool(Value::Number(0.into()));
        assert_eq!(out.get("flag").and_then(|v| v.as_bool()), Some(false));
    }

    #[test]
    fn to_bool_unparseable_is_null() {
        let out = map_with_to_bool(Value::String("maybe".to_string()));
        assert!(out.get("flag").unwrap().is_null());
    }
    fn extract_num(v: &Value) -> Option<f64> {
        v.get("price_num").and_then(|n| n.as_f64())
    }

    #[test]
    fn to_number_us_currency() {
        let out = map_with_to_number("$1,234.56");
        assert_eq!(extract_num(&out).unwrap(), 1234.56);
    }

    #[test]
    fn to_number_eu_format() {
        let out = map_with_to_number("1.234,56");
        assert_eq!(extract_num(&out).unwrap(), 1234.56);
    }

    #[test]
    fn to_number_parentheses_negative() {
        let out = map_with_to_number("(1,234.56)");
        assert_eq!(extract_num(&out).unwrap(), -1234.56);
    }

    #[test]
    fn to_number_spaces_and_symbol() {
        let out = map_with_to_number("€ 1 234,56");
        assert_eq!(extract_num(&out).unwrap(), 1234.56);
    }

    #[test]
    fn to_number_unparseable_is_null() {
        let out = map_with_to_number("N/A");
        let v = out.get("price_num").expect("mapped field should exist");
        assert!(v.is_null());
    }
}

impl Default for FieldMapper {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for FieldMapper {
    fn clone(&self) -> Self {
        // Recreate with the same built-ins; custom registrations aren’t persisted currently
        FieldMapper::new()
    }
}
