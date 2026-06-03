# AI 新建线索 Skill 接口文档

> 版本：第一版  
> 日期：2026-06-03  
> 适用范围：第一期

## 1. 文档目标

本文档用于正式定义 `AI 新建线索 Skill` 的接口协议。

本文档定死以下内容：

- 路由地址
- 请求结构
- 返回结构
- 固定状态值
- 多轮草稿会话机制
- 重复线索处理动作

从这一版开始，前端、智能助手、后续其他 agent 都应按本文档对接。

## 2. Skill 定位

`AI 新建线索 Skill` 是一个后端标准能力，用于处理“对话式创建线索”。

它负责：

- 接收结构化草稿
- 合并当前会话中的历史草稿
- 检查是否缺字段
- 检查是否重复
- 满足条件后正式创建线索

## 3. 接口清单

当前包含 2 个接口：

1. 新建线索 Skill 主接口
2. 放弃当前线索创建会话接口

## 4. 接口一：新建线索 Skill

### 4.1 路由

`POST /api/v1/skills/lead-creation`

### 4.2 用途

用于处理：

- 第一次提交线索草稿
- 后续多轮补字段
- 重复校验
- 正式创建线索

### 4.3 请求体

```json
{
  "company_name": "华北科技",
  "organization_code": "",
  "region": "",
  "source": "自然流量",
  "owner_id": null,
  "notes": "由智能助手创建",
  "contacts": [
    {
      "name": "张三",
      "job_title": "采购经理",
      "phone": "13800000011",
      "wechat": "zhangsan",
      "is_primary": true
    }
  ],
  "session_id": null
}
```

### 4.4 字段说明

- `company_name`：公司名称
- `organization_code`：组织机构代码
- `region`：大区
- `source`：来源
- `owner_id`：负责人编号，可为空
- `notes`：备注
- `contacts`：联系人数组
- `session_id`：当前草稿会话编号，首次创建可为空，补字段时应传回上次返回的会话编号

### 4.5 必填规则

真正要求满足创建条件的字段是：

- 公司名称
- 至少一组联系人
- 第一组联系人姓名
- 第一组联系人手机号

### 4.6 固定返回状态

该接口只允许返回 3 个状态：

- `missing_fields`
- `duplicate_found`
- `success`

不允许再扩出其他自由状态值。

## 5. 返回结构

### 5.1 通用返回结构

```json
{
  "status": "missing_fields",
  "missing_fields": [],
  "duplicate_lead": null,
  "lead": null,
  "draft": {},
  "session_id": 1,
  "available_actions": []
}
```

### 5.2 字段说明

- `status`：固定状态值
- `missing_fields`：缺失字段数组
- `duplicate_lead`：疑似重复线索对象
- `lead`：创建成功后的线索对象
- `draft`：当前标准化草稿
- `session_id`：当前草稿会话编号
- `available_actions`：当前状态下允许用户继续执行的动作

## 6. 三种状态定义

### 6.1 missing_fields

表示：

- 当前草稿还不能创建
- 还缺关键字段
- 系统应该继续追问用户

#### 示例

```json
{
  "status": "missing_fields",
  "missing_fields": ["联系人姓名", "手机号"],
  "duplicate_lead": null,
  "lead": null,
  "draft": {
    "company_name": "华北科技",
    "organization_code": "",
    "region": "",
    "source": "自然流量",
    "owner_id": null,
    "notes": "由智能助手创建",
    "contacts": []
  },
  "session_id": 3,
  "available_actions": []
}
```

#### 调用方动作

- 保存 `session_id`
- 继续向用户追问缺失字段
- 下一轮补字段时继续调用同一个接口

### 6.2 duplicate_found

表示：

- 当前草稿字段已经够创建
- 但系统发现疑似重复线索
- 当前不直接创建

#### 示例

```json
{
  "status": "duplicate_found",
  "missing_fields": [],
  "duplicate_lead": {
    "id": 18,
    "company_name": "华北科技",
    "primary_contact_name": "张三",
    "primary_contact_phone": "13800000011"
  },
  "lead": null,
  "draft": {
    "company_name": "华北科技",
    "organization_code": "",
    "region": "",
    "source": "自然流量",
    "owner_id": null,
    "notes": "由智能助手创建",
    "contacts": [
      {
        "name": "张三",
        "job_title": "",
        "phone": "13800000011",
        "wechat": "",
        "is_primary": true
      }
    ]
  },
  "session_id": 4,
  "available_actions": [
    {
      "kind": "view_duplicate_lead",
      "label": "查看已有线索",
      "payload": {
        "lead_id": 18
      }
    },
    {
      "kind": "discard_creation",
      "label": "放弃创建",
      "payload": {
        "session_id": 4
      }
    }
  ]
}
```

#### 当前第一版允许动作

- `view_duplicate_lead`
- `discard_creation`

#### 当前第一版不做

- 覆盖已有线索
- 合并已有线索
- 强行继续创建

### 6.3 success

表示：

- 字段完整
- 未发现重复
- 已经创建成功

#### 示例

```json
{
  "status": "success",
  "missing_fields": [],
  "duplicate_lead": null,
  "lead": {
    "id": 25,
    "company_name": "华北科技",
    "status": "跟进中",
    "owner_id": null,
    "contact_count": 1
  },
  "draft": {},
  "session_id": 5,
  "available_actions": []
}
```

#### 调用方动作

- 清空本地草稿
- 清空本地 `session_id`
- 提示用户创建成功
- 刷新线索列表

## 7. 多轮草稿会话机制

### 7.1 作用

用于支持用户分多轮补字段。

例如：

第一轮：

`帮我创建线索，公司叫华北科技`

第二轮：

`联系人张三`

第三轮：

`手机号13800000011`

如果没有后端会话，系统会在多轮中丢上下文。  
现在通过 `session_id` 解决这个问题。

### 7.2 机制说明

1. 首次调用时可不传 `session_id`
2. 后端自动创建一个草稿会话
3. 返回 `session_id`
4. 后续每轮补字段都带上这个 `session_id`
5. 后端把新字段和旧草稿合并
6. 创建成功后，会话状态改为 `completed`
7. 用户放弃创建后，会话状态改为 `discarded`

## 8. 接口二：放弃当前创建会话

### 8.1 路由

`POST /api/v1/skills/lead-creation/discard`

### 8.2 用途

当用户在 `duplicate_found` 状态下选择“放弃创建”时，前端调用该接口结束当前草稿会话。

### 8.3 请求体

```json
{
  "session_id": 4
}
```

### 8.4 返回示例

```json
{
  "status": "discarded",
  "session_id": 4
}
```

## 9. 重复处理策略

第一版当前只支持两种重复后续动作：

1. 查看已有线索
2. 放弃创建

### 9.1 查看已有线索

由前端根据 `available_actions` 中的：

```json
{
  "kind": "view_duplicate_lead",
  "label": "查看已有线索",
  "payload": {
    "lead_id": 18
  }
}
```

跳转到该线索详情页。

### 9.2 放弃创建

由前端根据：

```json
{
  "kind": "discard_creation",
  "label": "放弃创建",
  "payload": {
    "session_id": 4
  }
}
```

调用放弃接口，清空当前创建流程。

## 10. 当前结论

从这一版开始，`AI 新建线索 Skill` 的协议已经正式定死：

- 只有 3 个返回状态
- 使用 `session_id` 做多轮草稿会话
- 重复场景只允许“查看已有线索”或“放弃创建”

后续扩展时，不应再随意增加返回形态，而应在当前协议上继续演进。
