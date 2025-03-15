// Build script to extract HTML and JavaScript from index.ts
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// First, run the Bun build to create the index.js file
console.log('Building JavaScript bundle...');
const bunBuild = spawn('bun', ['build', 'index.ts', '--outdir', './build']);

bunBuild.stdout.on('data', (data) => {
  console.log(`${data}`);
});

bunBuild.stderr.on('data', (data) => {
  console.error(`${data}`);
});

bunBuild.on('close', (code) => {
  if (code !== 0) {
    console.error(`Bun build process exited with code ${code}`);
    return;
  }
  
  console.log('JavaScript bundle built successfully.');
  
  // Now extract the HTML and JavaScript from index.ts
  console.log('Extracting HTML and JavaScript from index.ts...');
  
  try {
    const indexTs = fs.readFileSync('index.ts', 'utf8');
    
    // Extract the HTML
    const htmlMatch = indexTs.match(/const appletHtml = `([\s\S]*?)`;/);
    if (htmlMatch && htmlMatch[1]) {
      const html = htmlMatch[1];
      fs.writeFileSync(path.join('build', 'index.html'), html);
      console.log('HTML extracted and saved to build/index.html');
    } else {
      console.error('Could not extract HTML from index.ts');
    }
    
    // Extract the client-side JavaScript
    const jsMatch = indexTs.match(/const appletJs = `([\s\S]*?)`;/);
    if (jsMatch && jsMatch[1]) {
      const js = jsMatch[1];
      fs.writeFileSync(path.join('build', 'applet.js'), js);
      console.log('JavaScript extracted and saved to build/applet.js');
    } else {
      console.error('Could not extract JavaScript from index.ts');
    }
    
    // Create a manifest.json file
    const manifestMatch = indexTs.match(/const appletManifest = ({[\s\S]*?});/);
    if (manifestMatch && manifestMatch[1]) {
      try {
        // Evaluate the manifest object
        const manifestStr = manifestMatch[1].replace(/'/g, '"');
        fs.writeFileSync(path.join('build', 'manifest.json'), manifestStr);
        console.log('Manifest extracted and saved to build/manifest.json');
      } catch (error) {
        console.error('Error parsing manifest:', error);
      }
    } else {
      console.error('Could not extract manifest from index.ts');
    }
    
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Error during build:', error);
  }
}); 