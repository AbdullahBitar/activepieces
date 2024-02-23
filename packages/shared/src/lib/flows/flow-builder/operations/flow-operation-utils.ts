import semver from "semver"
import { Action, ActionType } from "../../actions/action"
import { FlowVersion } from "../../flow-version"
import { Trigger, TriggerType } from "../../triggers/trigger"
import { DeleteActionRequest } from "../../flow-operations"

type Step = Action | Trigger

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

function transferStep<T extends Step>(
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