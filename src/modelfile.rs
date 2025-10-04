// A parser for ollama modelfile
// https://github.com/ollama/ollama/blob/main/docs/modelfile.md

// Modelfile grammar
// command -> Instruction arguments*
// Instruction -> "FROM" | "PARAMETER" | "TEMPLATE"...
// arguments -> WORD | quoted_string | multiline_string
// quoted_string -> "<str>"
// multiline_string -> """<str>"""

// NXT: Tests...
// NXT: Builder fns for adding Instructions
// NXT: Write to modelfile

use std::{fs, str::FromStr};

use nom::{
    AsChar, IResult, Parser,
    branch::alt,
    bytes::complete::{tag_no_case, take_until1, take_while1},
    character::complete::multispace0,
    combinator::map,
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
enum Role {
    System,
    User,
    Assistant,
}

#[derive(Clone, Debug)]
enum Output<'a> {
    Single(&'a str),
    Pair((&'a str, &'a str)),
}

impl FromStr for Role {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "system" => Ok(Role::System),
            "user" => Ok(Role::User),
            "assistant" => Ok(Role::Assistant),
            _ => Err("Invalid Role".to_owned()),
        }
    }
}
#[derive(Debug)]
struct Parameter {
    param_type: String,
    value: ParamValue,
}

#[derive(Debug)]
struct Message {
    role: Role,
    message: String,
}

impl Parameter {
    fn new(param_type: String, value: ParamValue) -> Self {
        Self { param_type, value }
    }
}

#[derive(Debug)]
pub struct Modelfile {
    from: String,
    parameters: Vec<Parameter>,
    template: String,
    adapter: String,
    system: String,
    license: String,
    messages: Vec<Message>,
    data: String,
}

pub fn parse_from_file(path: &str) -> Result<Modelfile, String> {
    let content = fs::read_to_string(path).expect("File read failed");
    parse(content.as_str())
}

pub fn parse(input: &str) -> Result<Modelfile, String> {
    match parse_file(input) {
        Ok((rest, parsed_data)) => {
            if !rest.is_empty() {
                // println!("Parsed file{:?}", parsed_data);
                Err("Modelfile failed to parse".to_owned())
            } else {
                // println!("Parsed file{:?}", parsed_data);
                create_modelfile(input, parsed_data.clone())
            }
        }
        Err(_err) => Err("Modelfile failed to parse".to_owned()),
    }
}

fn parse_file(input: &str) -> IResult<&str, Vec<(&str, Output)>> {
    separated_list1(multispace0, parse_command).parse(input)
}

fn parse_command(input: &str) -> IResult<&str, (&str, Output)> {
    pair(
        delimited(multispace0, parse_instruction, multispace0),
        alt((
            map(parse_multiquote, Output::Single),
            map(parse_singlequote, Output::Single),
            map(parse_parameter0, Output::Pair),
            map(parse_singleline, Output::Single),
        )),
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

fn parse_parameter0(input: &str) -> IResult<&str, (&str, &str)> {
    pair(
        delimited(
            multispace0,
            alt((
                tag_no_case("stop"),
                tag_no_case("num_ctx"),
                tag_no_case("repeat_last_n"),
                tag_no_case("temperature"),
                tag_no_case("seed"),
                tag_no_case("top_k"),
                tag_no_case("top_p"),
                tag_no_case("min_p"),
                tag_no_case("num_predict"),
                tag_no_case("repeat_penalty"),
                tag_no_case("user"),
                tag_no_case("assistant"),
                tag_no_case("system"),
            )),
            multispace0,
        ),
        alt((parse_multiquote, parse_singlequote, parse_singleline)),
    )
    .parse(input)
}

fn parse_multiquote(input: &str) -> IResult<&str, &str> {
    delimited(
        tag_no_case("\"\"\""),
        take_until1("\"\"\""),
        tag_no_case("\"\"\""),
    )
    .parse(input)
}

fn parse_singlequote(input: &str) -> IResult<&str, &str> {
    delimited(tag_no_case("\""), take_until1("\""), tag_no_case("\"")).parse(input)
}
fn parse_singleline(input: &str) -> IResult<&str, &str> {
    delimited(
        multispace0,
        take_while1(|c: char| !c.is_newline()),
        multispace0,
    )
    .parse(input)
}
fn create_modelfile(input: &str, commands: Vec<(&str, Output)>) -> Result<Modelfile, String> {
    // TODO: There might be a better way
    let mut modelfile: Modelfile = Modelfile {
        from: "".to_owned(),
        data: input.to_owned(),
        parameters: vec![],
        template: "".to_owned(),
        messages: vec![],
        license: "".to_owned(),
        adapter: "".to_owned(),
        system: "".to_owned(),
    };
    let mut error: String = "".to_string();
    for command in commands {
        match (command.0.to_lowercase().as_str(), command.1) {
            //TODO: Can add validations for path if its a gguf file later
            ("from", Output::Single(from)) => modelfile.from = from.to_owned(),
            ("parameter", Output::Pair((param, argument))) => {
                match parse_parameter(param, argument) {
                    Ok(parameter) => modelfile.parameters.push(parameter),
                    Err(err) => error = err,
                }
            }
            ("template", Output::Single(template)) => modelfile.template = template.to_owned(),
            ("system", Output::Single(system)) => modelfile.system = system.to_owned(),
            ("adapter", Output::Single(adapter)) => modelfile.adapter = adapter.to_owned(),
            ("message", Output::Pair((role, message))) => match parse_message(role, message) {
                Ok(message) => modelfile.messages.push(message),
                Err(err) => error = err,
            },
            ("license", Output::Single(license)) => modelfile.license = license.to_owned(),
            ("#", _) => {}
            _ => error = "Invalid instruction".to_owned(),
        };
    }
    if error.is_empty() {
        Ok(modelfile)
    } else {
        Err(error)
    }
}

fn parse_parameter(param: &str, argument: &str) -> Result<Parameter, String> {
    let param_type: String = param.to_lowercase();
    match (param_type.as_str(), argument) {
        ("num_ctx", value) => parse_int(param_type, value),
        ("repeat_last_n", value) => parse_int(param_type, value),
        ("repeat_penalty", value) => parse_float(param_type, value),
        ("temperature", value) => parse_float(param_type, value),
        ("seed", value) => parse_int(param_type, value),

        ("stop", value) => Ok(Parameter::new(
            param_type,
            ParamValue::Str(value.trim_matches('\"').to_owned()),
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

fn parse_message(role: &str, message: &str) -> Result<Message, String> {
    let binding = role.to_lowercase();
    let param_type = binding.as_str();
    if let Ok(role) = param_type.parse::<Role>() {
        Ok(Message {
            role,
            message: message.to_owned(),
        })
    } else {
        Err(format!("{} not a valid role", param_type))
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
