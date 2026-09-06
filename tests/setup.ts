// Tests never touch the real .chirp-data store. The RosterStore singleton reads CHIRP_DATA_DIR at construction, so set it first.
import fs from 'fs';
import os from 'os';
import path from 'path';
process.env.CHIRP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chirp-test-data-'));
