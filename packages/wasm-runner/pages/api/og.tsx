import { ImageResponse } from 'next/og';
// App router includes @vercel/og.
// No need to install it.

export const config = {
  runtime: 'edge',
};

export default function handler(req) {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          textAlign: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          flexWrap: 'nowrap',
          backgroundColor: 'white',
          backgroundSize: '100px 100px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="128" height="128">
            <path d="M0 0 C56.76 0 113.52 0 172 0 C172 27.72 172 55.44 172 84 C199.72 84 227.44 84 256 84 C256 113.04 256 142.08 256 172 C227.62 172 199.24 172 170 172 C170 143.62 170 115.24 170 86 C113.9 86 57.8 86 0 86 C0 57.62 0 29.24 0 0 Z " fill="black" transform="translate(0,0)"/>
            <path d="M0 0 C28.71 0 57.42 0 87 0 C87 28.38 87 56.76 87 86 C58.29 86 29.58 86 0 86 C0 57.62 0 29.24 0 0 Z " fill="black" transform="translate(0,170)"/>
          </svg>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 40,
            fontStyle: 'normal',
            color: 'black',
            marginTop: 30,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
          }}
        >
          <b>tilekit.dev</b>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
} 