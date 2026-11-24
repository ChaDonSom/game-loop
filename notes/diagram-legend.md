# Diagram legend

All diagrams in this repo use these rules. One visual means one thing, every time.

Use Mermaid. GitHub renders it in markdown files and PR descriptions.

## Where code lives: subgraph

Each workspace is one subgraph. Put every node in the subgraph of the workspace that holds it.

| Subgraph | Workspace |
| --- | --- |
| `shared` | `shared/` |
| `server` | `node-transport/` |
| `client` | `vue-client/` |

## What a node is: shape

| Shape | Mermaid | Meaning |
| --- | --- | --- |
| Rectangle | `id[name]` | Code: a module or a function |
| Cylinder | `id[(name)]` | Data: a list, a table, or state |

## What an edge is: line style

| Line | Mermaid | Meaning |
| --- | --- | --- |
| Dashed | `a -.-> b` | Direct call or read in the same process. Arrow points from caller to callee. |
| Solid | `a -->\|msg\| b` | Message on the wire. Label it with the message `type`. |

Only these two edge types. If no solid edge shows, nothing crosses the network.

## What is new: color

| Class | Meaning |
| --- | --- |
| `new` | Added in this change |
| `changed` | Exists, and this change edits it |
| `existing` | Context only. Not edited |

Paste these lines at the end of every diagram:

```
classDef new fill:#d9f2d9,stroke:#2e7d32,stroke-width:2px,color:#1b3d1d
classDef changed fill:#fff4d6,stroke:#b7791f,stroke-width:2px,color:#4a3510
classDef existing fill:#eeeeee,stroke:#9e9e9e,color:#616161
```

## Limits

- 8 nodes or fewer.
- Show only what is new, plus the context it touches.
- No other colors, shapes, or line styles. If you need a new one, add it to this file first.
