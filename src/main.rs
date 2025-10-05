use std::error::Error;

use tilekit::modelfile;
pub fn main() -> Result<(), Box<dyn Error>> {
    println!("{}:{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));

    let mut modf = modelfile::parse_from_file("fixtures/a.modelfile")?;
    modf.add_parameter("temperature", "0.5")?;
    modf.add_message("user", "Is Rust a functional language")?;
    modf.add_message("assistant", "no")?;
    modf.build()?;
    println!("{:?}", modf.to_string());
    Ok(())
}
