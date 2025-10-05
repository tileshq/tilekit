use std::error::Error;

use tilekit::modelfile;
pub fn main() -> Result<(), Box<dyn Error>> {
    println!("{}:{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));

    let modf = modelfile::parse_from_file("assets/tests/mistral.modelfile");

    println!("{:?}", modf);
    Ok(())
}
