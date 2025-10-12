// Module that handles CLI commands

use tilekit::{
    modelfile::{self, Modelfile},
    runner::mlx,
};

pub fn run(modelfile: &str) {
    // parse the modelfile
    // call the mlx runner and pass the modelfile
    let modelfile = modelfile::parse_from_file(modelfile).expect("Failed to read modelfile");
    mlx::run(&modelfile);
}
