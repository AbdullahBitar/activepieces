import semver from "semver"
import { Action, ActionType, SingleActionSchema } from "../../actions/action"
import { FlowVersion } from "../../flow-version"
import { Trigger, TriggerType } from "../../triggers/trigger"
import { AddActionRequest, DeleteActionRequest, StepLocationRelativeToParent, UpdateActionRequest } from "../../flow-operations"
import { TypeCompiler } from "@sinclair/typebox/compiler"
import { ActivepiecesError, ErrorCode } from "../../../common/activepieces-error"

type Step = Action | Trigger

const actionSchemaValidator = TypeCompiler.Compile(SingleActionSchema)

export function transferFlow<T extends Step>(
    flowVersion: FlowVersion,
    transferFunction: (step: T) => T,
): FlowVersion {
    const clonedFlow = JSON.parse(JSON.stringify(flowVersion))
    clonedFlow.trigger = transferStep(
        clonedFlow.trigger,
        transferFunction,
    ) as Trigger
    return clonedFlow
}

export function transferStep<T extends Step>(
    step: Step,
    transferFunction: (step: T) => T,
): Step {
    const updatedStep = transferFunction(step as T)
    if (updatedStep.type === ActionType.BRANCH) {
        const { onSuccessAction, onFailureAction } = updatedStep
        if (onSuccessAction) {
            updatedStep.onSuccessAction = transferStep(
                onSuccessAction,
                transferFunction,
            ) as Action
        }
        if (onFailureAction) {
            updatedStep.onFailureAction = transferStep(
                onFailureAction,
                transferFunction,
            ) as Action
        }
    }
    else if (updatedStep.type === ActionType.LOOP_ON_ITEMS) {
        const { firstLoopAction } = updatedStep
        if (firstLoopAction) {
            updatedStep.firstLoopAction = transferStep(
                firstLoopAction,
                transferFunction,
            ) as Action
        }
    }

    if (updatedStep.nextAction) {
        updatedStep.nextAction = transferStep(
            updatedStep.nextAction,
            transferFunction,
        ) as Action
    }

    return updatedStep
}

export function upgradePiece(step: Step, stepName: string): Step {
    if (step.name !== stepName) {
        return step
    }
    const clonedStep: Step = JSON.parse(JSON.stringify(step))
    switch (step.type) {
        case ActionType.PIECE:
        case TriggerType.PIECE: {
            const { pieceVersion, pieceName } = step.settings
            if (isLegacyApp({ pieceName, pieceVersion })) {
                return step
            }
            if (pieceVersion.startsWith('^') || pieceVersion.startsWith('~')) {
                return step
            }
            if (semver.valid(pieceVersion) && semver.lt(pieceVersion, '1.0.0')) {
                clonedStep.settings.pieceVersion = `~${pieceVersion}`
            }
            else {
                clonedStep.settings.pieceVersion = `^${pieceVersion}`
            }
            break
        }
        default:
            break
    }
    return clonedStep
}

// TODO Remove this in 2024, these pieces didn't follow the standarad versioning where the minor version has to be increased when there is breaking change.
function isLegacyApp({ pieceName, pieceVersion }: { pieceName: string, pieceVersion: string }) {
    let newVersion = pieceVersion
    if (newVersion.startsWith('^') || newVersion.startsWith('~')) {
        newVersion = newVersion.substring(1)
    }
    if (
        pieceName === '@activepieces/piece-google-sheets' &&
        semver.lt(newVersion, '0.3.0')
    ) {
        return true
    }
    if (
        pieceName === '@activepieces/piece-gmail' &&
        semver.lt(newVersion, '0.3.0')
    ) {
        return true
    }
    return false
}

export function deleteAction(
    flowVersion: FlowVersion,
    request: DeleteActionRequest,
): FlowVersion {
    return transferFlow(flowVersion, (parentStep) => {
        if (parentStep.nextAction && parentStep.nextAction.name === request.name) {
            const stepToUpdate: Action = parentStep.nextAction
            parentStep.nextAction = stepToUpdate.nextAction
        }
        switch (parentStep.type) {
            case ActionType.BRANCH: {
                if (
                    parentStep.onFailureAction &&
                    parentStep.onFailureAction.name === request.name
                ) {
                    const stepToUpdate: Action = parentStep.onFailureAction
                    parentStep.onFailureAction = stepToUpdate.nextAction
                }
                if (
                    parentStep.onSuccessAction &&
                    parentStep.onSuccessAction.name === request.name
                ) {
                    const stepToUpdate: Action = parentStep.onSuccessAction
                    parentStep.onSuccessAction = stepToUpdate.nextAction
                }
                break
            }
            case ActionType.LOOP_ON_ITEMS: {
                if (
                    parentStep.firstLoopAction &&
                    parentStep.firstLoopAction.name === request.name
                ) {
                    const stepToUpdate: Action = parentStep.firstLoopAction
                    parentStep.firstLoopAction = stepToUpdate.nextAction
                }
                break
            }
            default:
                break
        }
        return parentStep
    })
}

export function createAction(
    request: UpdateActionRequest,
    {
        nextAction,
        onFailureAction,
        onSuccessAction,
        firstLoopAction,
    }: {
        nextAction?: Action
        firstLoopAction?: Action
        onSuccessAction?: Action
        onFailureAction?: Action
    },
): Action {
    const baseProperties = {
        displayName: request.displayName,
        name: request.name,
        valid: false,
        nextAction,
    }
    let action: Action
    switch (request.type) {
        case ActionType.BRANCH:
            action = {
                ...baseProperties,
                onFailureAction,
                onSuccessAction,
                type: ActionType.BRANCH,
                settings: request.settings,
            }
            break
        case ActionType.LOOP_ON_ITEMS:
            action = {
                ...baseProperties,
                firstLoopAction,
                type: ActionType.LOOP_ON_ITEMS,
                settings: request.settings,
            }
            break
        case ActionType.PIECE:
            action = {
                ...baseProperties,
                type: ActionType.PIECE,
                settings: request.settings,
            }
            break
        case ActionType.CODE:
            action = {
                ...baseProperties,
                type: ActionType.CODE,
                settings: request.settings,
            }
            break
    }
    action.valid = (request.valid ?? true) && actionSchemaValidator.Check(action)
    return action
}

export function addAction(
    flowVersion: FlowVersion,
    request: AddActionRequest,
): FlowVersion {
    return transferFlow(flowVersion, (parentStep: Step) => {

        if (parentStep.name !== request.parentStep) {
            return parentStep
        }
        if (
            parentStep.type === ActionType.LOOP_ON_ITEMS &&
            request.stepLocationRelativeToParent
        ) {
            if (
                request.stepLocationRelativeToParent ===
                StepLocationRelativeToParent.INSIDE_LOOP
            ) {
                parentStep.firstLoopAction = createAction(request.action, {
                    nextAction: parentStep.firstLoopAction,
                })
            }
            else if (
                request.stepLocationRelativeToParent ===
                StepLocationRelativeToParent.AFTER
            ) {

                parentStep.nextAction = createAction(request.action, {
                    nextAction: parentStep.nextAction,

                })
            }
            else {
                throw new ActivepiecesError(
                    {
                        code: ErrorCode.FLOW_OPERATION_INVALID,
                        params: {},
                    },
                    `Loop step parent ${request.stepLocationRelativeToParent} not found`,
                )
            }
        }
        else if (
            parentStep.type === ActionType.BRANCH &&
            request.stepLocationRelativeToParent
        ) {
            if (
                request.stepLocationRelativeToParent ===
                StepLocationRelativeToParent.INSIDE_TRUE_BRANCH
            ) {
                parentStep.onSuccessAction = createAction(request.action, {
                    nextAction: parentStep.onSuccessAction,
                })
            }
            else if (
                request.stepLocationRelativeToParent ===
                StepLocationRelativeToParent.INSIDE_FALSE_BRANCH
            ) {
                parentStep.onFailureAction = createAction(request.action, {
                    nextAction: parentStep.onFailureAction,
                })
            }
            else if (
                request.stepLocationRelativeToParent ===
                StepLocationRelativeToParent.AFTER
            ) {
                parentStep.nextAction = createAction(request.action, {
                    nextAction: parentStep.nextAction,
                })
            }
            else {
                throw new ActivepiecesError(
                    {
                        code: ErrorCode.FLOW_OPERATION_INVALID,
                        params: {},
                    },
                    `Branch step parernt ${request.stepLocationRelativeToParent} not found`,
                )
            }
        }
        else {
            parentStep.nextAction = createAction(request.action, {
                nextAction: parentStep.nextAction,
            })
        }
        return parentStep
    })
}