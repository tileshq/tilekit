// A parser for ollama modelfile
// https://github.com/ollama/ollama/blob/main/docs/modelfile.md

// Modelfile grammar
// command -> Instruction arguments*
// Instruction -> "FROM" | "PARAMETER" | "TEMPLATE"...
// arguments -> WORD | quoted_string | multiline_string
// quoted_string -> "<str>"
// multiline_string -> """<str>"""

use nom::{
    AsChar, IResult, Parser,
    branch::alt,
    bytes::complete::{tag, tag_no_case, take_until, take_until1, take_while1},
    character::complete::{alpha1, alphanumeric1, anychar, multispace0, newline},
    multi::{many0, many1, separated_list0, separated_list1},
    sequence::{delimited, pair},
};

pub fn parse(_input: &str) -> Result<String, String> {
    Ok("Parsed successfully".to_owned())
}

pub fn parse_sep(input: &str) -> IResult<&str, Vec<&str>> {
    separated_list0(multispace0, tag("yo")).parse(input)
}

pub fn parse_file(input: &str) -> IResult<&str, Vec<(&str, &str)>> {
    separated_list1(multispace0, parse_command).parse(input)
}

pub fn parse_command(input: &str) -> IResult<&str, (&str, &str)> {
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
