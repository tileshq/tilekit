use std::error::Error;
use tilekit::modelfile;
pub fn main() -> Result<(), Box<dyn Error>> {
    println!("{}:{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));
    let modelfile = "FROM llama3.2

    PARAMETER num_ctx 4096
    Parameter repeat_penalty 2
    ";
    let res = modelfile::parse(modelfile);
    println!("{:?}", res);
    // let res_2 = modelfile::parse_from_file("../a.modelfile");
    // println!("{:?}", res_2);
    Ok(())
}
