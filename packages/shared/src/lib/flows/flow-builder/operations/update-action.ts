import { Action, ActionType } from "../../actions/action"
import { UpdateActionRequest } from "../../flow-operations"
import { FlowVersion } from "../../flow-version"
import { Trigger } from "../../triggers/trigger"
import { transferFlow, createAction, upgradePiece } from "./flow-operation-utils"

function extractActions(step: Trigger | Action): {
    nextAction?: Action
    onSuccessAction?: Action
    onFailureAction?: Action
    firstLoopAction?: Action
} {
    const nextAction = step.nextAction
    const onSuccessAction =
        step.type === ActionType.BRANCH ? step.onSuccessAction : undefined
    const onFailureAction =
        step.type === ActionType.BRANCH ? step.onFailureAction : undefined
    const firstLoopAction =
        step.type === ActionType.LOOP_ON_ITEMS ? step.firstLoopAction : undefined
    return { nextAction, onSuccessAction, onFailureAction, firstLoopAction }
}

function updateAction(
    flowVersion: FlowVersion,
    request: UpdateActionRequest,
): FlowVersion {
    return transferFlow(flowVersion, (parentStep) => {
        if (parentStep.nextAction && parentStep.nextAction.name === request.name) {
            const actions = extractActions(parentStep.nextAction)
            parentStep.nextAction = createAction(request, actions)
        }
        if (parentStep.type === ActionType.BRANCH) {
            if (
                parentStep.onFailureAction &&
                parentStep.onFailureAction.name === request.name
            ) {
                const actions = extractActions(parentStep.onFailureAction)
                parentStep.onFailureAction = createAction(request, actions)
            }
            if (
                parentStep.onSuccessAction &&
                parentStep.onSuccessAction.name === request.name
            ) {
                const actions = extractActions(parentStep.onSuccessAction)
                parentStep.onSuccessAction = createAction(request, actions)
            }
        }
        if (parentStep.type === ActionType.LOOP_ON_ITEMS) {
            if (
                parentStep.firstLoopAction &&
                parentStep.firstLoopAction.name === request.name
            ) {
                const actions = extractActions(parentStep.firstLoopAction)
                parentStep.firstLoopAction = createAction(request, actions)
            }
        }
        return parentStep
    })
}

export function updateActionFlow(flow: FlowVersion, request: UpdateActionRequest): FlowVersion {
    flow = transferFlow(
        updateAction(flow, request),
        (step) => upgradePiece(step, request.name),
    )
    return flow
}