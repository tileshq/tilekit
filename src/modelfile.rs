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
    bytes::complete::{tag_no_case, take_while1},
    character::complete::multispace0,
    multi::separated_list1,
    sequence::{delimited, pair},
};

pub fn parse(input: &str) -> Result<&str, &str> {
    match parse_file(input) {
        Ok((rest, parsed_data)) => {
            if !rest.is_empty() {
                return Err("Modelfile failed to parse");
            } else {
                println!("Parsed file{:?}", parsed_data);
                return Ok("Modelfile parsed successfully");
            }
        }
        Err(_err) => Err("Modelfile failed to parse"),
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
