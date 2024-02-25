import { Action, ActionType } from "../../actions/action";
import { FlowVersion } from "../../flow-version";
import { Trigger } from "../../triggers/trigger";

function traverseInternal(
    step: Trigger | Action | undefined,
): (Action | Trigger)[] {
    const steps: (Action | Trigger)[] = []
    while (step !== undefined && step !== null) {
        steps.push(step)
        if (step.type === ActionType.BRANCH) {
            steps.push(...traverseInternal(step.onSuccessAction))
            steps.push(...traverseInternal(step.onFailureAction))
        }
        if (step.type === ActionType.LOOP_ON_ITEMS) {
            steps.push(...traverseInternal(step.firstLoopAction))
        }
        step = step.nextAction
    }
    return steps
}

function getAllSteps(trigger: Trigger): (Action | Trigger)[] {
    return traverseInternal(trigger)
}

export function getSingleStep(flow: FlowVersion, name: string): (Action | Trigger | undefined) {
    let clonedFlow: FlowVersion = JSON.parse(JSON.stringify(flow))
    const steps = getAllSteps(clonedFlow.trigger)
    const sourceStep = steps.find((step) => step.name === name)
    return sourceStep
}