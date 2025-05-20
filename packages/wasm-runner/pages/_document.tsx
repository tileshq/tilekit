import { Html, Head, Main, NextScript } from 'next/document';
import type { DocumentProps } from 'next/document';

export default function Document({}: DocumentProps) {
  return (
    <Html>
      <Head>
        {/* Vercel Analytics Script - Added manually to avoid React hooks issues */}
        <script
          defer
          src="/_vercel/insights/script.js"
        ></script>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}