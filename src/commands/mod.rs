// Module that handles CLI commands

use tile::{
    core::{health, modelfile},
    runner::mlx,
};

pub fn run(modelfile: &str) {
    match modelfile::parse_from_file(modelfile) {
        Ok(modelfile) => {
            mlx::run(modelfile);
        }
        Err(err) => println!("{}", err),
    }
}

pub fn check_health() {
    health::check_health();
}
