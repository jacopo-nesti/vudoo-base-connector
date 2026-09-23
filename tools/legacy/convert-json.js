import { convertXmlToJson } from './xml-to-json.js';

convertXmlToJson().catch(error => {
  console.error(`ERROR conversione XML: ${error.message}`);
  process.exitCode = 1;
});
