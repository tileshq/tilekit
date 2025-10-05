use std::{error::Error, fs};
use tilekit::modelfile::{self, Modelfile};
pub fn main() -> Result<(), Box<dyn Error>> {
    println!("{}:{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));
    let res_2 = modelfile::parse_from_file("../a.modelfile");
    // let res_2_str = res_2.unwrap().to_string();
    // fs::write("../b.modelfile", res_2_str)?;
    let mut modd = modelfile::Modelfile::new();
    modd.add_comment("Using llama model yo")?;
    modd.add_from("llama3.2")?;
    modd.add_message("user", "hi")?;
    modd.build()?;
    fs::write("b.modelfile", modd.to_string())?;
    // println!("{:?}", modd);

    let mod_string = "FROM llama3.2";
    // let modfile = mod_string.parse::<Modelfile>();
    // modelfile.to_st
    // println!("{:?}", modfile.unwrap().to_string());

    // modfile.into()
    Ok(())
}
