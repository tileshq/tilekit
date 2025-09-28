use std::error::Error;
use tilekit::modelfile;
pub fn main() -> Result<(), Box<dyn Error>> {
    println!("{}:{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));
    let modelfile = "FROM llama3.2

    PARAMETER topt 3.5

    yo topn 4";
    let modelfile_2 = "FROM\nADAPTER\nui\nujuj\nADAPTER";
    let modelfile_3 = "FROM
    PARAMETER
    ADAPTER
    YOLO
    ";
    let res = modelfile::parse_file(modelfile);
    println!("{:?}", res);
    // let (rem, output) = breakfast::do_nothing_parser("hello world")?;
    // assert_eq!(rem, "hello world");
    // assert_eq!(output, "");
    // let (rem, output) = breakfast::parse_input_abc("abchello")?;
    // assert_eq!(rem, "hello");
    // assert_eq!(output, "abc");
    // assert!(breakfast::parse_input_abc("defworld").is_err());
    // let res = breakfast::parse_coords("( 3, 2)");
    // println!("{:?}", res);
    Ok(())
}
