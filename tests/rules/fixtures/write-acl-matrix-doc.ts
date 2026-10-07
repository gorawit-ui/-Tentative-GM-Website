// `npm run docs:acl-matrix`: regenerate docs/spec/ACL-MATRIX.md from the fixture.
import { writeFileSync } from 'node:fs';
import { ACL_MATRIX_DOC_PATH, renderAclMatrixMarkdown } from './acl-matrix-doc';

writeFileSync(new URL(`../../../${ACL_MATRIX_DOC_PATH}`, import.meta.url), renderAclMatrixMarkdown());
console.log(`wrote ${ACL_MATRIX_DOC_PATH}`);
