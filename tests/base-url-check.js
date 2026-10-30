// Prints the API base URL that extension/api.js resolves, for
// tests/api.test.js: `gjs -m tests/base-url-check.js`.
import {BASE_URL} from '../extension/api.js';

print(BASE_URL);
