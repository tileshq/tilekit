use nom::Parser;
use nom::branch::alt;
use nom::character::complete::{i32, multispace0};
use nom::sequence::{Tuple, pair, separated_pair, tuple};
use nom::{IResult, bytes::complete::tag, sequence::delimited};
#[derive(Debug)]
pub struct Coordinate {
    pub x: i32,
    pub y: i32,
}

pub fn parse(input: &str) -> Result<&str, &str> {
    let _protein = parse_protein(input);
    // let rest = tuple((tag("woth"), parse, tag("on the side")))(input);
    Ok("")
}

pub fn parse_protein(input: &str) -> IResult<&str, &str> {
    alt((
        tag("really crispy bacon"),
        tag("sausage"),
        tag("scrambled eggs"),
        tag("poached eggs"),
        tag("fried eggs"),
    ))
    .parse(input)
}

fn parse_bread(input: &str) -> IResult<&str, &str> {
    alt((tag("toast"), tag("biscuits"), tag("English muffin"))).parse(input)
}

pub fn do_nothing_parser(input: &str) -> IResult<&str, &str> {
    Ok((input, ""))
}

pub fn parse_input_abc(input: &str) -> IResult<&str, &str> {
    tag("abc")(input)
}

pub fn parse_coords(input: &str) -> IResult<&str, Coordinate> {
    // take out the brackets
    // separate frm commas
    let (rem, (x, y)) = delimited(tag("("), parse_from_comma, tag(")")).parse(input)?;
    Ok((rem, Coordinate { x, y }))
}

fn parse_from_comma(input: &str) -> IResult<&str, (i32, i32)> {
    separated_pair(
        delimited(multispace0, i32, multispace0),
        tag(","),
        delimited(multispace0, i32, multispace0),
    )
    .parse(input)
}

// coordinates to struct
// like (3, 2) -> Coordinate{x: 3, y: 2}
