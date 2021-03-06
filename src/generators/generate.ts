/**
 * @description get code using standard dataSource format
 * @NOTE getd files structure is as below:
 * - library (contains class library code)
 * - interfaces (contains interfaces code)
 * - api.d.ts (contains interfaces and library definitions)
 * - api-lock.json (contains local code state)
 */

import * as _ from 'lodash';
import { StandardDataSource, Interface, Mod, BaseClass } from '../standard';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
  format,
  reviseModName,
  Surrounding,
  getFileName,
  getTemplatesDirFile,
  judgeTemplatesDirFileExists
} from '../utils';
import { info } from '../debugLog';
import { templateRegistion } from '../templates';

export class FileStructures {
  constructor(
    public generators: CodeGenerator[],
    private usingMultipleOrigins: boolean,
    private surrounding = Surrounding.typeScript,
    private baseDir = 'src/service',
    private templateType = ''
  ) {}

  getMultipleOriginsFileStructures() {
    const files = {};

    this.generators
      .filter((generator) => generator.outDir === this.baseDir)
      .forEach((generator) => {
        const dsName = generator.dataSource.name;
        const dsFiles = this.getOriginFileStructures(generator, true);

        files[dsName] = dsFiles;
      });

    return {
      ...files,
      [getFileName('index', this.surrounding)]: this.getDataSourcesTs.bind(this),
      'api.d.ts': this.getDataSourcesDeclarationTs.bind(this)
    };
  }

  getBaseClassesInDeclaration(originCode: string, usingMultipleOrigins: boolean) {
    if (usingMultipleOrigins) {
      return `
      declare namespace defs {
        export ${originCode}
      };
      `;
    }

    return `
      declare ${originCode}
    `;
  }

  getModsDeclaration(originCode: string, usingMultipleOrigins: boolean) {
    if (usingMultipleOrigins) {
      return `
      declare namespace API {
        export ${originCode}
      };
      `;
    }

    return `
      declare ${originCode}
    `;
  }

  getOriginFileStructures(generator: CodeGenerator, usingMultipleOrigins = false) {
    console.log('3??????????????????-????????????');
    let mods = {};
    const dataSource = generator.dataSource;

    const indexFileName = getFileName('index', this.surrounding);

    dataSource.mods.forEach((mod) => {
      const currMod = {};

      mod.interfaces.forEach((inter) => {
        currMod[getFileName(inter.name, this.surrounding)] = generator.getInterfaceContent.bind(generator, inter);
        currMod[indexFileName] = generator.getModIndex.bind(generator, mod);
      });
      const modName = reviseModName(mod.name);
      mods[modName] = currMod;

      mods[indexFileName] = generator.getModsIndex.bind(generator);
    });

    if (!generator.hasContextBund) {
      generator.getBaseClassesInDeclaration = this.getBaseClassesInDeclaration.bind(
        this,
        generator.getBaseClassesInDeclaration(),
        usingMultipleOrigins
      );
      generator.getModsDeclaration = this.getModsDeclaration.bind(
        this,
        generator.getModsDeclaration(),
        usingMultipleOrigins
      );
      generator.hasContextBund = true;
    }

    const result = {
      [getFileName('baseClass', this.surrounding)]: generator.getBaseClassesIndex.bind(generator),
      mods: mods,
      [indexFileName]: generator.getIndex.bind(generator),
      'api.d.ts': generator.getDeclaration.bind(generator),
      'api-lock.json': this.getLockContent(generator)
    };

    return result;
  }

  getFileStructures() {
    console.log('3??????????????????');
    
    const result =
      this.usingMultipleOrigins || this.generators.length > 1
        ? this.getMultipleOriginsFileStructures()
        : this.getOriginFileStructures(this.generators[0]);

    // js???????????????????????????????????????pontCore??????
    if (this.surrounding === Surrounding.javaScript) {
      if (!fs.existsSync(this.baseDir + '/pontCore.js')) {
        result['pontCore.js'] = getTemplatesDirFile('pontCore.js', 'pontCore/');
        result['pontCore.d.ts'] = getTemplatesDirFile('pontCore.d.ts', 'pontCore/');
      }

      if (this.templateType && this.checkHasTemplateFetch()) {
        result[`${this.templateType}.js`] = getTemplatesDirFile(`${this.templateType}.js`, 'pontCore/');
        result[`${this.templateType}.d.ts`] = getTemplatesDirFile(`${this.templateType}.d.ts`, 'pontCore/');
      }
    }

    return result;
  }

  private checkHasTemplateFetch() {
    const templateTypesWithOutFetch = templateRegistion
      .map((item) => item.templateType)
      .filter((item) => item !== 'fetch');

    if (
      templateTypesWithOutFetch.includes(this.templateType) &&
      judgeTemplatesDirFileExists(`${this.templateType}.js`, 'pontCore/')
    ) {
      return true;
    }

    return false;
  }

  getMultipleOriginsDataSourceName() {
    const dsNames = this.generators.map((ge) => ge.dataSource.name);

    if (this.judgeHasMultipleFilesName()) {
      const generate = this.generators.find((ge) => ge.outDir === this.baseDir);

      if (generate) {
        return [generate.dataSource.name];
      }
    }

    return dsNames;
  }

  judgeHasMultipleFilesName(): boolean {
    return this.generators.some((generate) => {
      return generate.outDir !== this.baseDir;
    });
  }

  getDataSourcesTs() {
    const dsNames = this.getMultipleOriginsDataSourceName();

    const generatedCode = this.surrounding === Surrounding.typeScript ? '(window as any)' : 'window';

    return `
      ${dsNames
        .map((name) => {
          return `import { defs as ${name}Defs, ${name} } from './${name}';
          `;
        })
        .join('\n')}

      ${generatedCode}.defs = {
        ${dsNames.map((name) => `${name}: ${name}Defs,`).join('\n')}
      };
      ${generatedCode}.API = {
        ${dsNames.join(',\n')}
      };
    `;
  }

  getDataSourcesDeclarationTs() {
    const dsNames = this.getMultipleOriginsDataSourceName();

    return `
    ${dsNames
      .map((name) => {
        return `/// <reference path="./${name}/api.d.ts" />`;
      })
      .join('\n')}
    `;
  }

  getLockContent(generate: CodeGenerator): string {
    const dataSource = this.usingMultipleOrigins ? generate.dataSource : [generate.dataSource];
    return generate ? JSON.stringify(dataSource, null, 2) : '';
  }
}

export class CodeGenerator {
  usingMultipleOrigins = false;

  dataSource: StandardDataSource;

  hasContextBund = false;

  readonly lockFilename: string;

  constructor(public surrounding = Surrounding.typeScript, public outDir = '', lockFilename = 'api-lock.json') {
    this.lockFilename = lockFilename;
  }

  setDataSource(dataSource: StandardDataSource) {
    this.dataSource = dataSource;
    // ???basic-resource?????????????????????????????????
    this.dataSource.name = _.camelCase(this.dataSource.name);
  }

  /** ??????????????????????????????????????? */
  getBaseClassInDeclaration(base: BaseClass) {
    if (base.templateArgs && base.templateArgs.length) {
      return `class ${base.name}<${base.templateArgs.map((_, index) => `T${index} = any`).join(', ')}> {
        ${base.properties.map((prop) => prop.toPropertyCode(Surrounding.typeScript, true)).join('\n')}
      }
      `;
    }
    return `class ${base.name} {
      ${base.properties.map((prop) => prop.toPropertyCode(Surrounding.typeScript, true)).join('\n')}
    }
    `;
  }

  /** ???????????????????????????????????????????????? namespace
   * surrounding, ???????????????this.surrounding,????????????api.d.ts?????????????????????
   */
  getBaseClassesInDeclaration() {
    console.log('3??????????????????-????????????-???????????????????????????????????????');
    
    let content = `namespace ${this.dataSource.name || 'defs'} {
      ${this.dataSource.baseClasses
        .map(
          (base) => `
        export ${this.getBaseClassInDeclaration(base)}
      `
        )
        .join('\n')}
    }
    `;

    if(this.dataSource.name){
      content = `namespace defs { 
        namespace ${this.dataSource.name} {
        ${this.dataSource.baseClasses
          .map(
            (base) => `
          export ${this.getBaseClassInDeclaration(base)}
        `
          )
          .join('\n')}
        }
      }
      `;
    }

    return content;
  }

  getBaseClassesInDeclarationWithMultipleOrigins() {
    return `
      declare namespace defs {
        export ${this.getBaseClassesInDeclaration()}
      }
    `;
  }

  getBaseClassesInDeclarationWithSingleOrigin() {
    return `
      declare ${this.getBaseClassesInDeclaration()}
    `;
  }

  /** ??????????????????????????????????????? */
  getInterfaceContentInDeclaration(inter: Interface) {
    const bodyParams = inter.getBodyParamsCode();
    const requestParams = bodyParams ? `params: Params, bodyParams: ${bodyParams}` : `params: Params`;

    return `
      export ${inter.getParamsCode('Params', this.surrounding)}

      export type Response = ${inter.responseType};
      export const init: Response;
      export function request(${requestParams}): Promise<${inter.responseType}>;
    `;
  }

  private getInterfaceInDeclaration(inter: Interface) {
    return `
      /**
        * ${inter.description}
        * ${inter.path}
        */
      export namespace ${inter.name} {
        ${this.getInterfaceContentInDeclaration(inter)}
      }
    `;
  }

  /** ?????????????????????????????????????????? namespace ???????????????????????? */
  getModsDeclaration() {
    const mods = this.dataSource.mods;
    const content = `namespace ${this.dataSource.name || 'API'} {
        ${mods
          .map(
            (mod) => `
          /**
           * ${mod.description}
           */
          export namespace ${reviseModName(mod.name)} {
            ${mod.interfaces.map(this.getInterfaceInDeclaration.bind(this)).join('\n')}
          }
        `
          )
          .join('\n\n')}
      }
    `;

    return content;
  }

  getModsDeclarationWithMultipleOrigins() {}

  getModsDeclarationWithSingleOrigin() {}

  /** ????????????????????????????????? */
  getCommonDeclaration() {
    return '';
  }

  /** ?????????????????????????????? */
  getDeclaration() {
    return `
      type ObjectMap<Key extends string | number | symbol = any, Value = any> = {
        [key in Key]: Value;
      }

      ${this.getCommonDeclaration()}

      ${this.getBaseClassesInDeclaration()}

      ${this.getModsDeclaration()}
    `;
  }

  /** ????????????????????????????????? index ?????????????????? */
  getIndex() {
    let conclusion = `
      import * as defs from './baseClass';
      import './mods/';

      ${this.surrounding === Surrounding.typeScript ? '(window as any)' : 'window'}.defs = defs;
    `;

    // dataSource name means multiple dataSource
    if (this.dataSource.name) {
      conclusion = `
        import { ${this.dataSource.name} as defs } from './baseClass';
        export { ${this.dataSource.name} } from './mods/';
        export { defs };
      `;
    }

    return conclusion;
  }

  /** ?????????????????????????????? */
  getBaseClassesIndex() {
    const clsCodes = this.dataSource.baseClasses.map(
      (base) => `
        class ${base.name} {
          ${base.properties
            .map((prop) => {
              return prop.toPropertyCodeWithInitValue(base.name);
            })
            .filter((id) => id)
            .join('\n')}
        }
      `
    );

    if (this.dataSource.name) {
      return `
        ${clsCodes.join('\n')}
        export const ${this.dataSource.name} = {
          ${this.dataSource.baseClasses.map((bs) => bs.name).join(',\n')}
        }
      `;
    }

    return clsCodes.map((cls) => `export ${cls}`).join('\n');
  }

  /** ????????????????????????????????? */
  getInterfaceContent(inter: Interface) {
    const method = inter.method.toUpperCase();

    const bodyParams = inter.getBodyParamsCode();

    return `
    /**
     * @desc ${inter.description}
     */

    import * as defs from '../../baseClass';
    import { pontCore } from '../../pontCore';

    export ${inter.getParamsCode('Params', this.surrounding)}

    export const init = ${inter.response.getInitialValue()};

    export function request(${bodyParams ? `params = {}, bodyParams = null` : 'params = {}'}) {

      return pontCore.fetch(pontCore.getUrl("${inter.path}", params, "${method}"), {
        method: "${method}",
        body: ${bodyParams ? 'bodyParams' : 'null'},
      });
    }
   `;
  }

  /** ????????????????????? index ???????????? */
  getModIndex(mod: Mod) {
    return `
      /**
       * @description ${mod.description}
       */
      ${mod.interfaces
        .map((inter) => {
          return `import * as ${inter.name} from './${inter.name}';`;
        })
        .join('\n')}

      export {
        ${mod.interfaces.map((inter) => inter.name).join(', \n')}
      }
    `;
  }

  /** ????????????????????? index ???????????? */
  getModsIndex() {
    let conclusion = `
      ${this.surrounding === Surrounding.typeScript ? '(window as any)' : 'window'}.API = {
        ${this.dataSource.mods.map((mod) => reviseModName(mod.name)).join(', \n')}
      };
    `;

    // dataSource name means multiple dataSource
    if (this.dataSource.name) {
      conclusion = `
        export const ${this.dataSource.name} = {
          ${this.dataSource.mods.map((mod) => reviseModName(mod.name)).join(', \n')}
        };
      `;
    }

    return `
      ${this.dataSource.mods
        .map((mod) => {
          const modName = reviseModName(mod.name);
          return `import * as ${modName} from './${modName}';`;
        })
        .join('\n')}

      ${conclusion}
    `;
  }

  /**
   * ???????????????????????????
   * @param dataSource
   */
  getDataSourceCallback(dataSource?: StandardDataSource): void {
    // ?????????, ????????????????????????????????????
    if (dataSource) {
      return;
    }
  }
}

export class FilesManager {
  // todo: report ??????????????????????????????????????????????????????
  report = info;
  prettierConfig: {};

  constructor(public fileStructures: FileStructures, private baseDir: string) {}

  /** ????????????????????? */
  private initPath(path: string) {
    if (!fs.existsSync(path)) {
      fs.mkdirpSync(path);
    }
  }

  async regenerate(files: {}, oldFiles?: {}) {
    console.log('4?????????????????????2')
    console.log(Object.keys(files));
    // console.log(files['api.d.ts']);
    this.initPath(this.baseDir);

    if (oldFiles && Object.keys(oldFiles || {}).length) {
      const updateTask = this.diffFiles(files, oldFiles);
      if (updateTask.deletes && updateTask.deletes.length) {
        this.report(`??????${updateTask.deletes.length}?????????????????????`);
        await Promise.all(
          updateTask.deletes.map((filePath) => {
            fs.unlink(filePath);
          })
        );
      }

      if (updateTask.updateCnt) {
        this.report(`??????${updateTask.updateCnt}?????????`);
        console.time(`??????${updateTask.updateCnt}?????????`);
        await this.updateFiles(updateTask.files);
        console.timeEnd(`??????${updateTask.updateCnt}?????????`);
      }
    } else {
      await this.generateFiles(files);
    }
  }

  async saveLock(originName?: string) {
    const setLockFile = async (generator) => {
      const filePath = path.join(generator.outDir, generator.dataSource.name, generator.lockFilename);
      const lockContent = await fs.readFile(filePath, 'utf8');
      const newLockContent = this.fileStructures.getLockContent(generator);
      if (lockContent !== newLockContent) {
        await fs.writeFile(filePath, newLockContent);
      }
    };
    if (originName) {
      const targetOrigin = this.fileStructures.generators.find((generator) => generator.dataSource.name === originName);
      targetOrigin && setLockFile(targetOrigin);
    } else {
      this.fileStructures.generators.forEach(setLockFile);
    }
  }

  diffFiles(newFiles: {}, lastFiles: {}, dir = this.baseDir) {
    const task = {
      deletes: [] as string[],
      files: {},
      updateCnt: 0
    };

    // ?????????????????????
    _.map(lastFiles, (lastValue: string | {}, name) => {
      const currPath = `${dir}/${name}`;
      const newValue = newFiles[name];

      // ?????????
      if (!newValue) {
        task.deletes.push(currPath);
        return;
      }

      // ??????????????????
      if (typeof newValue === 'object' && typeof lastValue === 'string') {
        task.deletes.push(currPath);
        const fileTask = this.diffFiles(newValue, {}, currPath);

        if (fileTask.updateCnt) {
          task.files = { ...task.files, [currPath]: undefined, ...fileTask.files };
          task.updateCnt += fileTask.updateCnt + 1;
        }
        return;
      }

      // ??????????????????
      if (typeof newValue === 'string' && typeof lastValue === 'object') {
        task.deletes.push(currPath);
        return;
      }

      // ?????????
      if (typeof lastValue === 'string') {
        // ????????????
        if (newValue !== lastValue) {
          task.files[currPath] = newValue;
          task.updateCnt++;
        }
      } else {
        // ???????????????
        const fileTask = this.diffFiles(newValue, lastValue, currPath);
        task.deletes.push(...fileTask.deletes);
        if (fileTask.updateCnt) {
          task.updateCnt += fileTask.updateCnt;
          task.files = { ...task.files, ...fileTask.files };
        }
      }
    });

    // ?????????
    _.map(newFiles, (newValue: string | {}, name) => {
      const currPath = `${dir}/${name}`;
      const lastValue = lastFiles[name];

      if (!lastValue) {
        if (typeof newValue === 'string') {
          task.files[currPath] = newValue;
          task.updateCnt += 1;
        } else {
          const fileTask = this.diffFiles(newValue, {}, currPath);

          if (fileTask.updateCnt) {
            task.updateCnt += fileTask.updateCnt + 1;
            task.files = { ...task.files, [currPath]: undefined, ...fileTask.files };
          }
        }
      }
    });

    return task;
  }

  public formatFile(code: string, name = '') {
    if (name && name.endsWith('.json')) {
      return code;
    }

    return format(code, this.prettierConfig);
  }

  async updateFiles(files: {}) {
    await Promise.all(
      _.map(files, async (value: string, filePath) => {
        if (value === undefined) {
          return fs.mkdir(filePath);
        }
        if (filePath.endsWith('.json')) {
          return fs.writeFile(filePath, value);
        }
        return fs.writeFile(filePath, this.formatFile(value));
      })
    );
  }

  /** ?????? Codegenerator ??????????????????????????? */
  async generateFiles(files: {}, dir = this.baseDir) {
    console.log('5?????????????????????')

    const currFiles = await fs.readdir(dir);

    const promises = _.map(files, async (value: string | {}, name) => {
      const currPath = `${dir}/${name}`;

      if (typeof value === 'string') {
        if (currFiles.includes(name)) {
          const state = await fs.lstat(currPath);

          if (state.isDirectory()) {
            await fs.unlink(currPath);
            return fs.writeFile(currPath, this.formatFile(value, name));
          } else {
            const newValue = this.formatFile(value);
            const currValue = await fs.readFile(currPath, 'utf8');

            if (newValue !== currValue) {
              return fs.writeFile(currPath, this.formatFile(value, name));
            }

            return;
          }
        } else {
          return fs.writeFile(currPath, this.formatFile(value, name));
        }
      }

      // ?????????????????????
      if (currFiles.includes(name)) {
        const state = await fs.lstat(currPath);

        if (state.isDirectory()) {
          return this.generateFiles(files[name], currPath);
        } else {
          await fs.unlink(currPath);
          await fs.mkdir(currPath);

          return this.generateFiles(files[name], currPath);
        }
      } else {
        await fs.mkdir(currPath);

        return this.generateFiles(files[name], currPath);
      }
    });

    await Promise.all(promises);
  }
}
