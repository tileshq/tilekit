// Module that handles CLI commands

use tiles::{
    core::{
        health,
        modelfile::{self},
    },
    runner::mlx,
};

pub async fn run(modelfile: &str) {
    match modelfile::parse_from_file(modelfile) {
        Ok(modelfile) => {
            mlx::run(modelfile).await;
        }
        Err(err) => println!("{}", err),
    }
}

pub fn check_health() {
    health::check_health();
}
