// A parser for ollama modelfile
// https://github.com/ollama/ollama/blob/main/docs/modelfile.md

// Modelfile grammar
// command -> Instruction arguments*
// Instruction -> "FROM" | "PARAMETER" | "TEMPLATE"...
// arguments -> WORD | quoted_string | multiline_string
// quoted_string -> "<str>"
// multiline_string -> """<str>"""

use std::fs;

use nom::{
    AsChar, IResult, Parser,
    branch::alt,
    bytes::complete::{tag_no_case, take_while1},
    character::complete::multispace0,
    multi::separated_list1,
    sequence::{delimited, pair},
};

#[derive(Debug)]
enum ParamValue {
    Int(i32),
    Float(f32),
    Str(String),
}

#[derive(Debug)]
struct Parameter {
    param_type: String,
    value: ParamValue,
}

impl Parameter {
    fn new(param_type: String, value: ParamValue) -> Self {
        Self { param_type, value }
    }
}

#[derive(Debug)]
pub struct Modelfile {
    pub from: String,
    pub parameters: Vec<Parameter>,
    pub data: String,
}

pub fn parse_from_file(path: &str) -> Result<Modelfile, String> {
    let content = fs::read_to_string(path).expect("File read failed");
    parse(content.as_str())
}

pub fn parse(input: &str) -> Result<Modelfile, String> {
    match parse_file(input) {
        Ok((rest, parsed_data)) => {
            if !rest.is_empty() {
                Err("Modelfile failed to parse".to_owned())
            } else {
                println!("Parsed file{:?}", parsed_data);
                create_modelfile(input, parsed_data.clone())
            }
        }
        Err(_err) => Err("Modelfile failed to parse".to_owned()),
    }
}

fn parse_file(input: &str) -> IResult<&str, Vec<(&str, &str)>> {
    separated_list1(multispace0, parse_command).parse(input)
}

fn parse_command(input: &str) -> IResult<&str, (&str, &str)> {
    pair(
        delimited(multispace0, parse_instruction, multispace0),
        parse_arguments,
    )
    .parse(input)
}

fn parse_instruction(input: &str) -> IResult<&str, &str> {
    alt((
        tag_no_case("FROM"),
        tag_no_case("PARAMETER"),
        tag_no_case("TEMPLATE"),
        tag_no_case("SYSTEM"),
        tag_no_case("ADAPTER"),
        tag_no_case("LICENSE"),
        tag_no_case("MESSAGE"),
        tag_no_case("#"),
    ))
    .parse(input)
}

fn parse_arguments(input: &str) -> IResult<&str, &str> {
    delimited(
        multispace0,
        take_while1(|c: char| !c.is_newline()),
        multispace0,
    )
    .parse(input)
}

fn create_modelfile(input: &str, commands: Vec<(&str, &str)>) -> Result<Modelfile, String> {
    let mut modelfile: Modelfile = Modelfile {
        from: "".to_owned(),
        data: input.to_owned(),
        parameters: vec![],
    };
    let mut error: String = "".to_string();
    for command in commands {
        match (command.0.to_lowercase().as_str(), command.1) {
            //TODO: Can add validations for path if its a gguf file later
            ("from", arguments) => modelfile.from = arguments.to_owned(),
            ("parameter", arguments) => match parse_parameter(arguments) {
                Ok(parameter) => modelfile.parameters.push(parameter),
                Err(err) => error = err,
            },
            _ => error = "Invalid instruction".to_owned(),
        };
    }
    if error.is_empty() {
        Ok(modelfile)
    } else {
        Err(error)
    }
}

fn parse_parameter(arguments: &str) -> Result<Parameter, String> {
    let param_args: Vec<&str> = arguments.split_whitespace().into_iter().collect();
    if param_args.len() != 2 {
        return Err("Parameter should only have one parameter type and one value".to_owned());
    }

    let param_type: String = param_args[0].to_lowercase();
    match (param_type.as_str(), param_args[1]) {
        ("num_ctx", value) => parse_int(param_type, value),
        ("repeat_last_n", value) => parse_int(param_type, value),
        ("repeat_penalty", value) => parse_float(param_type, value),
        ("temperature", value) => parse_float(param_type, value),
        ("seed", value) => parse_int(param_type, value),

        ("stop", value) => Ok(Parameter::new(
            param_type,
            ParamValue::Str(value.to_owned()),
        )),

        ("num_predict", value) => parse_int(param_type, value),

        ("top_k", value) => parse_int(param_type, value),

        ("top_p", value) => parse_float(param_type, value),

        ("min_p", value) => parse_float(param_type, value),
        _ => Err("Invalid Parameter type".to_owned()),
    }
}

fn parse_int(param_type: String, value: &str) -> Result<Parameter, String> {
    if let Ok(parsed_val) = value.parse::<i32>() {
        Ok(Parameter::new(param_type, ParamValue::Int(parsed_val)))
    } else {
        Err(format!("{} not an Integer", param_type))
    }
}

fn parse_float(param_type: String, value: &str) -> Result<Parameter, String> {
    if let Ok(parsed_val) = value.parse::<f32>() {
        Ok(Parameter::new(param_type, ParamValue::Float(parsed_val)))
    } else {
        Err(format!("{} not a Float", param_type))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_modelfile() {
        let res = parse("");
        assert!(res.is_err());
    }
    #[test]
    fn test_wrong_instruction() {
        assert!(parse("FRO llama").is_err());
    }

    #[test]
    fn test_valid_modelfile() {
        let modelfile = "
            FROM llama3.2
            PARAMETER num_ctx 4096
        ";

        assert!(parse(modelfile).is_ok());
    }
}
