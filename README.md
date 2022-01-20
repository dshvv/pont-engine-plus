  <div align="center">
  <img src="https://img.alicdn.com/tfs/TB1cpLSGrvpK1RjSZFqXXcXUVXa-726-396.png" height="100">
  <h2>Pont - 搭建前后端之桥  </h2>
</div>

[![npm version](https://badge.fury.io/js/pont-engine.png)](https://badge.fury.io/js/pont-engine)
[![npm downloads](https://img.shields.io/npm/dt/pont-engine.svg?style=flat-square)](https://www.npmjs.com/package/pont-engine)
[![Gitter](https://badges.gitter.im/jasonHzq/pont-engine.svg)](https://gitter.im/jasonHzq/pont-engine?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
  

## 简介
Pont 把 swagger、rap、dip 等多种接口文档平台，转换成 Pont 元数据。Pont 利用接口元数据，可以高度定制化生成前端接口层代码，接口 mock 平台和接口测试平台。
其中 swagger 数据源，Pont 已经完美支持。并在一些大型项目中使用了近两年，各种高度定制化需求都可以满足。

此版本作为原本Pont-v1.0.12的问题修复版，重点解决了一些BUG，如：
```text
修复Swagger V3生成api，无返回类型的映射定义
修复在Swagger V3情况下，没有配置项name的情况下会报错
```
其它均无变化和修改。

## 安装
```shell
// npm
npm i pont-engine-plus

// 或pnpm
pnpm i pont-engine-plus

// 或yarn
yarn add pont-engine-plus

```
当然也可以全局安装，这点和原版完全一致

## 使用
```shell
pont-plus start
```
使用方式和配置文件均和原版一致，未作改动

## 代码修改的地方
1、编译命令行修改   
因为源码我从官网下载下build报错，排查发现有使用linux命令，我window自然不兼容。    
所以改为使用跨平台[shx](https://github.com/shelljs/shx)来执行命令（windows的bash、linux的shell等等）。  

package.json   
```json
"build": "rm -rf lib & npm run build-hooks-js && tsc"
```
改为
```json
"build": "shx rm -rf lib & npm run build-hooks-js && tsc"
```
2、swagger v3配置项无name打包报错修复   
源码打包后，在具体项目使用时如果配置文件`pont-config.json`没有配置name。   
打包会报错。所以做了如下修复。

/src/manage.ts
```javascript
 existsLocal() {
    return (
      fs.existsSync(path.join(this.currConfig.outDir, this.lockFilename)) ||
      _.some(this.allConfigs.map((config) => fs.existsSync(path.join(config.outDir, config.name, this.lockFilename)))) 
    );
  }
```
改为
```javascript
 existsLocal() { // 判断本地是否已经存在lockFilename文件(即api-lock.json)
    // config.name可能为空,而且lockFilename文件根本不在config.name这里层，而是直接在config.outDir里
    return (
      fs.existsSync(path.join(this.currConfig.outDir, this.lockFilename)) ||
      _.some(this.allConfigs.map((config) => fs.existsSync(path.join(config.outDir, this.lockFilename)))) 
    );
  }
```

3、swagger v3无返回类型修复   
其实也没做什么，因为从npm下载下来的包，一直无返回类型，但是我从源码打包却有。   
因此推论，源码有修复bug后，npm并没有及时更新。   
所以我才重新修复如上问题，在npm上发一个分支包，方便使用

4、swagger v3修复了生成类型文件错误问提      
如果配置文件`pont-config.json`有name。   
生成的api.d.ts文件则会报错。   
分析代码很明显是因为生成的实体类型嵌套问题
```typescript
ype ObjectMap<Key extends string | number | symbol = any, Value = any> = {
  [key in Key]: Value;
};

declare namespace myApi {
    ...
    export class JsonResult<T0 = any> {
      /** code */
      code?: number;

      /** data */
      data?: defs.myApi.ArticleVOObject;

      /** msg */
      msg?: string;
    }
}
declare namespace API {
   export namespace updateById {
      export class Params {}

      export type Response = defs.myApi.JsonResult;  //这里引用报错

      export const init: Response;

      export function request(params: Params, options?: any): Promise<Response>;
    }
}

```
所以我将/src/generators/generate.ts做了修改如下
```typescript
/** 获取所有基类的类型定义代码，一个 namespace
   * surrounding, 优先级高于this.surrounding,用于生成api.d.ts时强制保留类型
   */
  getBaseClassesInDeclaration() {
    console.log('3、文件构造器-具体实现-（返回类型）基类的类型定义');
    
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

    // 改动处：增加了如下代码
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
```


## 推荐
网友推荐，除了pont，还有其它很多竞品：   
[openapi2typescript](https://github.com/chenshuai2144/openapi2typescript)   
[YApi to TypeScript](https://github.com/fjc0k/yapi-to-typescript)