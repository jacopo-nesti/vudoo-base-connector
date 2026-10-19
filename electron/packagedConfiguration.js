import { constants } from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function preparePackagedConfiguration(resourcesPath, userDataPath) {
  const source = path.join(resourcesPath, 'config-defaults');
  const destination = path.join(userDataPath, 'config');
  await mkdir(path.join(destination, 'suppliers'), { recursive: true });
  const files = [
    'canonical-categories.json',
    ...(await readdir(path.join(source, 'suppliers')))
      .filter(file => file.endsWith('.json'))
      .map(file => path.join('suppliers', file)),
  ];
  for (const file of files) {
    try {
      await copyFile(path.join(source, file), path.join(destination, file), constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  return {
    configRoot: destination,
    reportRoot: path.join(userDataPath, 'reports'),
  };
}
