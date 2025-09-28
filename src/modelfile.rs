// A parser for ollama modelfile
// https://github.com/ollama/ollama/blob/main/docs/modelfile.md

// Modelfile grammar
// command -> Instruction arguments*
// Instruction -> "FROM" | "PARAMETER" | "TEMPLATE"...
// arguments -> WORD | quoted_string | multiline_string
// quoted_string -> "<str>"
// multiline_string -> """<str>"""

use nom::{
    IResult, Parser,
    bits::complete::tag,
    branch::alt,
    bytes::complete::{tag_no_case, take_until1, take_while1},
    character::complete::{alpha1, alphanumeric1, anychar},
    multi::{many0, separated_list1},
    sequence::pair,
};

pub fn parse(_input: &str) -> Result<String, String> {
    Ok("Parsed successfully".to_owned())
}

pub fn parse_command(input: &str) -> IResult<&str, (&str, &str)> {
    pair(parse_instruction, parse_arguments).parse(input)
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
    ))
    .parse(input)
}

fn parse_arguments(input: &str) -> IResult<&str, &str> {
    take_while1(|c: char| c.is_ascii())(input)
}
