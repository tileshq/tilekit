use std::error::Error;
use tilekit::modelfile;
pub fn main() -> Result<(), Box<dyn Error>> {
    println!("{}:{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));
    let res_2 = modelfile::parse_from_file("../a.modelfile");
    // println!("{:?}", res_2);

    let mut modd = modelfile::Modelfile::new();
    modd.add_from("llama3.2")?;
    modd.add_message("user", "hi")?;
    modd.build()?;
    println!("{:?}", modd);
    Ok(())
}
