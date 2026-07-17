# OBS 接口响应结构与字段说明

本文记录 DFT IDE 已确认的 OBS 接口响应结构。除文件下载接口返回二进制流外，大多数接口返回 JSON。客户端解析应允许额外字段存在，不应根据未声明字段判定响应无效。

## 14.1 通用响应包结构

```json
{
  "code": 1,
  "message": "success",
  "data": {},
  "extrasMessage": ""
}
```

| 字段 | 类型 | 是否必有 | 说明 |
| --- | --- | --- | --- |
| `code` | number | 通常有 | `1` 表示成功，其他值表示失败 |
| `message` | string | 通常有 | 后端提示信息或错误码 |
| `data` | object / array / string | 不一定 | 具体业务数据 |
| `extrasMessage` | string | 可选 | 额外错误信息或补充说明 |

失败响应可能只有 `message`，因此不能只依赖 `code`：

```json
{ "code": 500, "message": "FILE_NOT_EXIST" }
```

```json
{ "message": "FILE_NOT_EXIST" }
```

## 14.2 SpaceToken

```http
GET /file-system-server-dft/api/v1/space/group/getSpaceToken
```

成功响应：

```json
{
  "code": 1,
  "data": { "spaceToken": "xxx" },
  "message": "success",
  "extrasMessage": ""
}
```

`data.spaceToken` 是后续文件操作接口必须携带的 SpaceToken。失败示例：

```json
{
  "code": 500,
  "message": "SPACE_NOT_EXIST",
  "extrasMessage": "Space not found."
}
```

## 14.3 Bucket 列表

```http
GET /file-system-server-dft/api/v1/bucket/list/group/OBS
```

```json
{
  "code": 1,
  "data": {
    "dft": [
      { "id": 123, "name": "dft-files" }
    ]
  },
  "message": "success"
}
```

`data` 按 groupName 分组，key 不是固定字段。解析时应使用当前配置的 `groupName`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `data.{groupName}` | array | 当前 group 下的 bucket 数组 |
| `data.{groupName}[].id` | number | 创建 Space 时使用的 bucketId |
| `data.{groupName}[].name` | string | bucket 名称，例如 `dft-files` |

## 14.4 创建 Space

```http
POST /file-system-server-dft/api/v1/space/create
```

成功响应：

```json
{ "code": 1, "message": "success" }
```

失败示例：

```json
{ "code": 500, "message": "SPACE_ALREADY_EXIST" }
```

## 14.5 查询目录/文件详情

```http
GET /file-system-server-dft/api/v1/file/command/children
```

```json
{
  "code": 1,
  "data": [
    {
      "fileType": "FOLDER",
      "fileName": "eco",
      "fullPath": "/eco",
      "parentPath": "/",
      "md5": ""
    },
    {
      "fileType": "FILE",
      "fileName": "run_flow_sailor_eco",
      "fullPath": "/eco/run_flow_sailor_eco",
      "parentPath": "/eco",
      "md5": "e10adc3949ba59abbe56e057f20f883e"
    }
  ],
  "message": "success"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `data[].fileType` | string | `FILE` 或 `FOLDER` |
| `data[].fileName` | string | 文件名或目录名 |
| `data[].fullPath` | string | 空间内完整路径，通常以 `/` 开头 |
| `data[].parentPath` | string | 父目录路径 |
| `data[].md5` | string | 文件 MD5，目录通常为空 |

不存在时可能返回 `{ "message": "FILE_NOT_EXIST" }`。

## 14.6 获取文件下载直链

```http
GET /file-system-server-dft/api/v1/file/command/url
```

```json
{
  "code": 1,
  "data": "https://xxx/xxx",
  "message": "success"
}
```

`data` 是文件下载 URL。

## 14.7 查询文件详情

```http
GET /file-system-server-dft/api/v1/file/command/detail
```

```json
{
  "code": 1,
  "data": {
    "fileType": "FILE",
    "fileName": "run_flow_sailor_eco",
    "fullPath": "/eco/run_flow_sailor_eco",
    "parentPath": "/eco",
    "md5": "e10adc3949ba59abbe56e057f20f883e",
    "updaterName": "xxx"
  },
  "message": "success"
}
```

实际响应字段可能更多，客户端必须允许额外字段存在。`md5` 可作为当前文件内容指纹参与更新检测。

## 14.8 查询空间文件树及 MD5

```http
GET /file-system-server-dft/api/v1/file/command/queryFileTree
```

```json
{
  "code": 1,
  "data": {
    "subFile": [
      {
        "fileType": "FOLDER",
        "fileName": "eco",
        "fullPath": "/eco",
        "md5": "",
        "subFile": [
          {
            "fileType": "FILE",
            "fileName": "run_flow_sailor_eco",
            "fullPath": "/eco/run_flow_sailor_eco",
            "md5": "e10adc3949ba59abbe56e057f20f883e",
            "subFile": []
          }
        ]
      }
    ]
  },
  "message": "success"
}
```

更新检测可递归遍历 `data.subFile`，只记录 `fileType === "FILE"` 的节点，生成 `fullPath -> md5` 映射。

## 14.9 查询文件版本列表

```http
GET /file-system-server-dft/api/v1/file/command/queryFileVersionList
```

```json
{
  "code": 1,
  "data": [
    { "id": 0, "version": "current" },
    { "id": 12345, "version": "v1" }
  ],
  "message": "success"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `data[].id` | number | 历史版本下载使用的版本 ID；`0` 通常表示最新版 |
| `data[].version` | string | 版本名称 |

下载历史版本前，需要先用 `version` 找到对应 `id`，再请求 `/file-system-server-dft/api/v1/file/download/version/{id}`。

## 14.10 上传文件

```http
POST /file-system-server-dft/api/v1/file/command/upload
```

成功响应：

```json
{ "code": 1, "message": "success" }
```

常见错误包括 `FILE_ALREADY_EXIST` 和 `SPACE_NOT_EXIST`。

## 14.11 下载最新文件

```http
GET /file-system-server-dft/api/v1/file/command/download
```

成功时返回文件二进制流；失败时可能返回 JSON：

```json
{ "code": 500, "message": "FILE_NOT_EXIST" }
```

| 情况 | Content-Type | 返回内容 |
| --- | --- | --- |
| 成功 | `application/octet-stream` 或具体文件类型 | 文件二进制内容 |
| 失败 | `application/json` | 错误 JSON |

保存文件前应检查 Content-Type 或识别 JSON 错误结构。

## 14.12 下载历史版本文件

```http
GET /file-system-server-dft/api/v1/file/download/version/{versionId}
```

成功返回二进制流。失败示例：

```json
{ "code": 500, "message": "VERSION_NOT_EXIST" }
```

## 14.13 创建目录

```http
POST /file-system-server-dft/api/v1/file/command/mkdir
```

成功响应：

```json
{ "code": 1, "message": "success" }
```

常见错误为 `FOLDER_ALREADY_EXIST`。

## 14.14 文件编辑锁

```http
POST UPDATE_OBS_FILE_EDIT_LOCK
```

成功：

```json
{
  "code": 1,
  "message": "success",
  "data": { "Code": 200, "Msg": "success", "Data": {} }
}
```

被他人锁定：

```json
{
  "code": 1,
  "message": "success",
  "data": {
    "Code": -2,
    "Msg": "file locked by other user",
    "Data": { "user_id": "otherUser" }
  }
}
```

判断规则：`data.Code === 200` 表示成功，`data.Code === -2` 表示文件被他人锁定，其他值表示失败。

## 14.15 分片上传响应字段（待确认）

已知接口：

| 功能 | URI |
| --- | --- |
| 获取 UploadId | `/file-system-server-dft/api/v1/file/command/chunk/uploadid` |
| 查询分片列表 | `/file-system-server-dft/api/v1/file/command/chunk/list` |
| 上传分片 | `/file-system-server-dft/api/v1/file/command/chunk/upload` |
| 合并分片 | `/file-system-server-dft/api/v1/file/command/chunk/merge` |
| 取消分片上传 | `/file-system-server-dft/api/v1/file/command/chunk/cancel` |

以下字段仍需从 `obs_operator.cpp` 的调用与 JSON 解析代码中确认：

- UploadId：`uploadId`、`filepath`、`chunkSize`、`expireTime`。
- 分片列表：`chunkIndex` / `partNumber`、`chunkMd5` / `md5`、`size`、`uploadId`。
- 上传与合并：是否返回 `data.md5`、`data.fullPath`、`data.fileSize`。
- 取消：是否仍以 `code === 1` 表示成功。

## 14.16 TypeScript 响应类型建议

```ts
export interface ObsBaseResponse<T = unknown> {
  code?: number;
  message?: string;
  extrasMessage?: string;
  data?: T;
}

export interface ObsSpaceTokenData {
  spaceToken: string;
}

export interface ObsBucketItem {
  id: number;
  name: string;
}

export type ObsBucketListData = Record<string, ObsBucketItem[]>;

export interface ObsFileItem {
  fileType?: 'FILE' | 'FOLDER' | string;
  fileName?: string;
  fullPath?: string;
  parentPath?: string;
  md5?: string;
  updaterName?: string;
  subFile?: ObsFileItem[];
  [key: string]: unknown;
}

export interface ObsFileVersionItem {
  id: number;
  version: string;
}

export interface ObsEditLockResponse {
  code?: number;
  message?: string;
  data?: {
    Code?: number;
    Msg?: string;
    Data?: {
      user_id?: string;
      [key: string]: unknown;
    };
  };
}

export function isObsSuccess(resp: ObsBaseResponse): boolean {
  return resp.code === 1;
}

export function getObsErrorMessage(resp: ObsBaseResponse): string {
  return resp.extrasMessage || resp.message || 'Unknown OBS error';
}

export function isEditLockSuccess(resp: ObsEditLockResponse): boolean {
  return resp.data?.Code === 200;
}

export function isEditLockedByOther(resp: ObsEditLockResponse): boolean {
  return resp.data?.Code === -2;
}
```

IDE 侧下载、更新提示、MD5 对比和版本列表至少需要明确并兼容以下字段：`code`、`message`、`extrasMessage`、`data`、`data.md5`、`data.fullPath`、`data.fileType`、`data.subFile`、`data.version`、`data.id`。
