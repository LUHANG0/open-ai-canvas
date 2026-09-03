import { WorkflowBatchArtifactButton, type WorkflowBatchArtifactButtonProps } from "./workflow-batch-artifact-button";

export function WorkflowBatchVideoButton(props: WorkflowBatchArtifactButtonProps) {
    return <WorkflowBatchArtifactButton {...props} stage="video" />;
}

export function WorkflowBatchPrevizButton(props: WorkflowBatchArtifactButtonProps) {
    return <WorkflowBatchArtifactButton {...props} stage="previz" />;
}
