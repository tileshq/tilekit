// Module that handles CLI commands

use tile::{
    core::{health, modelfile},
    runner::mlx,
};

pub fn run(modelfile: &str) {
    // parse the modelfile
    // call the mlx runner and pass the modelfile
    let modelfile = modelfile::parse_from_file(modelfile).expect("Failed to read modelfile");
    mlx::run(&modelfile);
}

pub fn check_health() {
    health::check_health();
}
