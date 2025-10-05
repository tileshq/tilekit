use std::error::Error;
pub fn main() -> Result<(), Box<dyn Error>> {
    println!("{}:{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));
    Ok(())
}
