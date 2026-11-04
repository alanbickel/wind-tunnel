# The Workflow Editor

How a workflow gets from the call tree in a project to what the screen shows, for maintainers new to the code. A workflow is the path one kind of request takes through the architecture ([UX design §2.5](../design/user-experience.md#25-describe-a-requests-path)). Today the screen lists a project's workflows and shows a selected one's steps as an outline in Details. Issues on steps ([#120](https://github.com/alanbickel/wind-tunnel/issues/120)), the path on the diagram ([#121](https://github.com/alanbickel/wind-tunnel/issues/121)) and in its text version ([#122](https://github.com/alanbickel/wind-tunnel/issues/122)), and editing ([#116](https://github.com/alanbickel/wind-tunnel/issues/116), [#117](https://github.com/alanbickel/wind-tunnel/issues/117)) add to this guide as they land. Read [the domain model](domain-model.md) and [the user interface](user-interface.md) first.

## A workflow, three ways

The same workflow appears three ways, and this section answers "how does the tree on disk become what I see?" The example is Template B's "Create order", because it has both kinds of child: `calls`, made in order while the step holds its component, and `async` work, done later, when a queue's consumer takes the message. (Template A's "Create order" has the same shape without the queue.)

**1. The stored call tree.** What `Workflow.root` holds, and the template's JSON: each step has an ID, a component's ID, and an action. A step's `calls` are its children; an `enqueue` may have one `async` child.

```mermaid
flowchart TB
    apiStep["create-order-api<br/>api · invoke"]
    fnStep["create-order-fn-api<br/>fn-api · invoke"]
    queueStep["create-order-orders-queue<br/>orders-queue · enqueue"]
    writerStep["create-order-fn-writer<br/>fn-writer · invoke"]
    dbStep["create-order-orders-db<br/>orders-db · write"]
    apiStep -->|calls| fnStep
    fnStep -->|calls| queueStep
    queueStep -.->|async| writerStep
    writerStep -->|calls| dbStep
```

**2. The outline in Details.** Selecting the workflow shows its steps numbered, as `workflowDetails` builds them: each step named by its component's name and its action, never by an ID; its calls numbered under its own number; and an `enqueue`'s async work after its calls, under "Async work, done when a consumer takes the message". Each line is a button that selects the step.

```text
1  API Gateway · invoke
   1.1  fn-api · invoke
        1.1.1  orders-queue · enqueue
               Async work, done when a consumer takes the message
               1.1.1.1  fn-writer · invoke
                        1.1.1.1.1  orders-db · write
```

**3. The path on the diagram.** A selected workflow highlights the components and edges its steps use, and a selected step rings its component and the edge its call arrives on ([UX design §4.1](../design/user-experience.md#41-selection)). That's #121's; until then the diagram shows nothing for either.

## How a step is addressed

A step is named by its `id`, not by where it is in the tree ([ADR-0020](../adr/0020-give-workflow-steps-stable-ids.md)). A path such as `["workflows", 1, "root", "calls", 0]` shifts when an earlier sibling moves or goes, so a selection held as a path would jump to another step after an edit or an undo; an ID doesn't change. So a selected step is `{ kind: "step", workflowId, stepId }`, and the outline keeps each step's ID beside its number for selecting it, never for showing it. Run issues still carry paths, because they're worked out afresh from the project each time.

The bundled templates' step IDs are readable (`create-order-fn-api`), but a copy of a template gets new ones from the `IdGenerator`, as a blank project's steps would. Nothing can come to depend on a template's IDs, and a test can't look up a copied step by one.

## The parts

How the pieces connect (the [legend](architecture-overview.md#the-system-at-a-glance) explains the colors):

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 320}}}%%
flowchart TB
    subgraph ui["ui/project/"]
        list["<b>ArchitectureView</b><br/>[Component]<br/>The Workflows list, a row per workflow"]:::component
        details["<b>SelectionDetails, WorkflowOutline</b><br/>[Component]<br/>The heading, Used by, and the outline"]:::component
        selecting["<b>useSelection</b><br/>[Component]<br/>The selection, the tab, and where the focus returns"]:::component
        undo["<b>useUndoRedo</b><br/>[Component]<br/>Moves the selection after an undo"]:::component
    end
    subgraph app["application/"]
        describeUc["<b>DescribeSelection</b><br/>[Component: use-cases/]<br/>Finds the workflow and the step"]:::component
        outline["<b>workflowDetails, usedByLine</b><br/>[Component: details/]<br/>The numbered outline, and its words"]:::component
        afterUndo["<b>selectionAfterUndo</b><br/>[Component: details/]<br/>Keeps a step while it's there"]:::component
    end
    stepTree["<b>stepsOfWorkflow</b><br/>[domain/model/step-tree.ts]"]:::external
    list -->|"select(workflow)"| selecting
    details -->|"selectWithin(step)"| selecting
    details -->|"execute({ project, selection })"| describeUc
    describeUc --> outline
    describeUc & afterUndo --> stepTree
    undo --> afterUndo
    style ui fill:none,stroke:#666,stroke-dasharray:5 5
    style app fill:none,stroke:#666,stroke-dasharray:5 5
    classDef person fill:#08427b,stroke:#052e56,color:#fff
    classDef system fill:#1168bd,stroke:#0b4884,color:#fff
    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000
    classDef external fill:#999,stroke:#6b6b6b,color:#fff
    classDef planned fill:#fff,stroke:#1168bd,color:#1168bd,stroke-dasharray:5 5
```

## Selecting a workflow or a step

- **The list.** Under the diagram's text version, "Workflows" lists the project's workflows in project order, each a button that selects it. Its row is marked `aria-current` while the workflow, or one of its steps, is selected. With no workflows, it says "No workflows yet. A workflow is the path one kind of request takes through your architecture."
- **Details.** `DescribeSelection` answers both kinds with one `WorkflowDetails`: the name, the names of the workloads whose mix has it (`usedBy`), the outline, and `currentStepId`, the selected step's or undefined. It describes nothing for a workflow the project doesn't have, or a step that isn't in that workflow. The heading is the workflow's name, "· Workflow"; then "Used by: Lunch rush, Steady day", or "Used by: no workload yet", joined with semicolons when a name has a comma of its own, as the templates' do; then the outline, the selected step marked `aria-current`. A step whose component is gone reads "a removed component · read", since a component's ID is never shown. There's no Remove yet.
- **Focus.** As for a component: selecting a workflow or a step moves the focus to the Details heading, and Escape, or Close in a narrow window, clears the selection and returns the focus to whatever made it. A step is selected from inside Details, so the outline selects it with `selectWithin`, which keeps the element remembered before, the workflow's row; the step's own button goes when Details closes.
- **Undo and redo.** `selectionAfterUndo` keeps a selected workflow while the project still has it, and a selected step while its workflow still has a step with its ID, async work included; otherwise it clears the selection. Nothing removes a step or a workflow yet, so today an undo only redraws the outline, with any renamed component's new name.

## Worked example

[`workflow-outlines.test.ts`](../../src/adapters/templates/details/workflow-outlines.test.ts) describes each template's workflows with `DescribeSelection` and lays them out as Details does, in [`workflow-outlines.txt`](../../src/adapters/templates/details/workflow-outlines.txt). It lives beside the templates, since `application/` can't import them. Template A's:

```text
Template A: Serverless API with RDS

Get order
Used by: Lunch rush, 20 s at 2,000 requests/s; Steady day, 200 requests/s; Long rush, 2 min at 2,000 requests/s
1  API Gateway · invoke
   1.1  fn-orders · invoke
        1.1.1  orders-db · read

Create order
Used by: Lunch rush, 20 s at 2,000 requests/s; Steady day, 200 requests/s; Long rush, 2 min at 2,000 requests/s
1  API Gateway · invoke
   1.1  fn-orders · invoke
        1.1.1  orders-db · write
```

Template B's "Create order" is the outline in [A workflow, three ways](#a-workflow-three-ways). If an outline changes, the test fails and the diff shows how. If the change is intended, run `npx vitest run src/adapters/templates/details --update`, then update the excerpts on this page.
