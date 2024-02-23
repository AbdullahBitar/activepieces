import {
    FlowOperationType,
    FlowOperationRequest,
    StepLocationRelativeToParent,
    MoveActionRequest,
} from './flow-operations'
import {
    Action,
    ActionType,
    BranchAction,
    LoopOnItemsAction,
} from './actions/action'
import { Trigger, TriggerType } from './triggers/trigger'
import { FlowVersion } from './flow-version'
import { ActivepiecesError, ErrorCode } from '../common/activepieces-error'
import { applyFunctionToValuesSync, isString } from '../common'
import { FlowBuilder } from './flow-builder/flow-builder'
import { addAction, deleteAction } from './flow-builder/operations/flow-operation-utils'
import { transferStep } from './flow-builder/operations/flow-operation-utils'

type Step = Action | Trigger

type GetAllSubFlowSteps = {
    subFlowStartStep: Step
}

type GetStepFromSubFlow = {
    subFlowStartStep: Step
    stepName: string
}

function isValid(flowVersion: FlowVersion) {
    let valid = true
    const steps = flowHelper.getAllSteps(flowVersion.trigger)
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        valid = valid && step.valid
    }
    return valid
}

function isAction(type: ActionType | TriggerType | undefined): boolean {
    return Object.entries(ActionType).some(([, value]) => value === type)
}

function isTrigger(type: ActionType | TriggerType | undefined): boolean {
    return Object.entries(TriggerType).some(([, value]) => value === type)
}

function getUsedPieces(trigger: Trigger): string[] {
    return traverseInternal(trigger)
        .filter(
            (step) =>
                step.type === ActionType.PIECE || step.type === TriggerType.PIECE,
        )
        .map((step) => step.settings.pieceName)
        .filter((value, index, self) => self.indexOf(value) === index)
}

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

async function transferStepAsync<T extends Step>(
    step: Step,
    transferFunction: (step: T) => Promise<T>,
): Promise<Step> {
    const updatedStep = await transferFunction(step as T)

    if (updatedStep.type === ActionType.BRANCH) {
        const { onSuccessAction, onFailureAction } = updatedStep
        if (onSuccessAction) {
            updatedStep.onSuccessAction = (await transferStepAsync(
                onSuccessAction,
                transferFunction,
            )) as Action
        }
        if (onFailureAction) {
            updatedStep.onFailureAction = (await transferStepAsync(
                onFailureAction,
                transferFunction,
            )) as Action
        }
    }
    else if (updatedStep.type === ActionType.LOOP_ON_ITEMS) {
        const { firstLoopAction } = updatedStep
        if (firstLoopAction) {
            updatedStep.firstLoopAction = (await transferStepAsync(
                firstLoopAction,
                transferFunction,
            )) as Action
        }
    }

    if (updatedStep.nextAction) {
        updatedStep.nextAction = (await transferStepAsync(
            updatedStep.nextAction,
            transferFunction,
        )) as Action
    }

    return updatedStep
}

async function transferFlowAsync<T extends Step>(
    flowVersion: FlowVersion,
    transferFunction: (step: T) => Promise<T>,
): Promise<FlowVersion> {
    const clonedFlow = JSON.parse(JSON.stringify(flowVersion))
    clonedFlow.trigger = (await transferStepAsync(
        clonedFlow.trigger,
        transferFunction,
    )) as Trigger
    return clonedFlow
}

function getAllSteps(trigger: Trigger): (Action | Trigger)[] {
    return traverseInternal(trigger)
}

function getAllStepsAtFirstLevel(step: Trigger): (Action | Trigger)[] {
    const steps: (Action | Trigger)[] = []
    steps.push(step)
    let nextAction: Step | undefined = step.nextAction
    while (nextAction !== undefined) {
        steps.push(nextAction)
        nextAction = nextAction.nextAction
    }
    return steps
}
function getAllChildSteps(action: LoopOnItemsAction | BranchAction): Action[] {
    switch (action.type) {
        case ActionType.LOOP_ON_ITEMS:
            return traverseInternal(action.firstLoopAction) as Action[]
        default:
            return [
                ...traverseInternal(action.onSuccessAction),
                ...traverseInternal(action.onFailureAction),
            ] as Action[]
    }
}

function getAllDirectChildStepsForLoop(action: LoopOnItemsAction ): Action[] {
    const actions: Action[] = []
    
    let child = action.firstLoopAction
    while (child) {
        actions.push(child)
        child = child.nextAction
    }
   
    return actions
}

function getAllDirectChildStepsForBranch(action: BranchAction, branch: 'success' | 'failure' ): Action[] {
    const actions: Action[] = []
    if (branch === 'success') {
        let child = action.onSuccessAction
        while (child) {
            actions.push(child)
            child = child.nextAction
        }
    }
    else {
        let child = action.onFailureAction
        while (child) {
            actions.push(child)
            child = child.nextAction
        }
    }   
    return actions
   
}

function getStep(
    flowVersion: FlowVersion,
    stepName: string,
): Action | Trigger | undefined {
    return getAllSteps(flowVersion.trigger).find(
        (step) => step.name === stepName,
    )
}

const getAllSubFlowSteps = ({
    subFlowStartStep,
}: GetAllSubFlowSteps): Step[] => {
    return traverseInternal(subFlowStartStep)
}

const getStepFromSubFlow = ({
    subFlowStartStep,
    stepName,
}: GetStepFromSubFlow): Step | undefined => {
    const subFlowSteps = getAllSubFlowSteps({
        subFlowStartStep,
    })

    return subFlowSteps.find((step) => step.name === stepName)
}

function moveAction(
    flowVersion: FlowVersion,
    request: MoveActionRequest,
): FlowVersion {
    const steps = getAllSteps(flowVersion.trigger)
    const sourceStep = steps.find((step) => step.name === request.name)
    if (!sourceStep || !isAction(sourceStep.type)) {
        throw new ActivepiecesError(
            {
                code: ErrorCode.FLOW_OPERATION_INVALID,
                params: {},
            },
            `Source step ${request.name} not found`,
        )
    }
    const destinationStep = steps.find(
        (step) => step.name === request.newParentStep,
    )
    if (!destinationStep) {
        throw new ActivepiecesError(
            {
                code: ErrorCode.FLOW_OPERATION_INVALID,
                params: {},
            },
            `Destination step ${request.newParentStep} not found`,
        )
    }
    const childOperation: FlowOperationRequest[] = []
    const clonedSourceStep: Step = JSON.parse(JSON.stringify(sourceStep))
    if (
        clonedSourceStep.type === ActionType.LOOP_ON_ITEMS ||
    clonedSourceStep.type === ActionType.BRANCH
    ) {
    // Don't Clone the next action for first step only
        clonedSourceStep.nextAction = undefined
        childOperation.push(...getImportOperations(clonedSourceStep))
    }
    flowVersion = deleteAction(flowVersion, { name: request.name })
    flowVersion = addAction(flowVersion, {
        action: sourceStep as Action,
        parentStep: request.newParentStep,
        stepLocationRelativeToParent: request.stepLocationRelativeToNewParent,
    })

    childOperation.forEach((operation) => {
        flowVersion = flowHelper.apply(flowVersion, operation)
    })
    return flowVersion
}

function isChildOf(parent: LoopOnItemsAction | BranchAction, childStepName: string): boolean {
    switch (parent.type) {
        case ActionType.LOOP_ON_ITEMS: {
            const children = getAllChildSteps(parent)
            return children.findIndex((c) => c.name === childStepName) > -1
        }
        default: {
            const children = getAllChildSteps(parent)
            return children.findIndex((c) => c.name === childStepName) > -1
        }
    }
}

export function getImportOperations(
    step: Action | Trigger | undefined,
): FlowOperationRequest[] {
    const steps: FlowOperationRequest[] = []
    while (step) {
        if (step.nextAction) {
            steps.push({
                type: FlowOperationType.ADD_ACTION,
                request: {
                    parentStep: step.name,
                    action: removeAnySubsequentAction(step.nextAction),
                },
            })
        }
        switch (step.type) {
            case ActionType.BRANCH: {
                if (step.onFailureAction) {
                    steps.push({
                        type: FlowOperationType.ADD_ACTION,
                        request: {
                            parentStep: step.name,
                            stepLocationRelativeToParent:
                  StepLocationRelativeToParent.INSIDE_FALSE_BRANCH,
                            action: removeAnySubsequentAction(step.onFailureAction),
                        },
                    })
                    steps.push(...getImportOperations(step.onFailureAction))
                }
                if (step.onSuccessAction) {
                    steps.push({
                        type: FlowOperationType.ADD_ACTION,
                        request: {
                            parentStep: step.name,
                            stepLocationRelativeToParent:
                  StepLocationRelativeToParent.INSIDE_TRUE_BRANCH,
                            action: removeAnySubsequentAction(step.onSuccessAction),
                        },
                    })
                    steps.push(...getImportOperations(step.onSuccessAction))
                }
                break
            }
            case ActionType.LOOP_ON_ITEMS: {
                if (step.firstLoopAction) {
                    steps.push({
                        type: FlowOperationType.ADD_ACTION,
                        request: {
                            parentStep: step.name,
                            stepLocationRelativeToParent:
                StepLocationRelativeToParent.INSIDE_LOOP,
                            action: removeAnySubsequentAction(step.firstLoopAction),
                        },
                    })
                    steps.push(...getImportOperations(step.firstLoopAction))
                }
                break

            }
            case ActionType.CODE:
            case ActionType.PIECE: 
            case TriggerType.PIECE:
            case TriggerType.WEBHOOK:
            case TriggerType.EMPTY:
            {
                break
            }
        }
      
      
        step = step.nextAction
    }
    return steps
}


function removeAnySubsequentAction(action: Action): Action {
    const clonedAction: Action = JSON.parse(JSON.stringify(action))
    switch (clonedAction.type) {
        case ActionType.BRANCH: {
            delete clonedAction.onSuccessAction
            delete clonedAction.onFailureAction
            break
        }
        case ActionType.LOOP_ON_ITEMS: {
            delete clonedAction.firstLoopAction
            break
        }
        case ActionType.PIECE:
        case ActionType.CODE:
            break
    }
    delete clonedAction.nextAction
    return clonedAction
}

function duplicateStep(stepName: string, flowVersionWithArtifacts: FlowVersion): FlowVersion {
    const clonedStep = JSON.parse(JSON.stringify(flowHelper.getStep(flowVersionWithArtifacts, stepName)))
    clonedStep.nextAction = undefined
    if (!clonedStep) {
        throw new Error(`step with name '${stepName}' not found`)
    }
    const existingNames = getAllSteps(flowVersionWithArtifacts.trigger).map((step) => step.name)
    const oldStepsNameToReplace = getAllSteps(clonedStep).map((step) => step.name)
    const oldNameToNewName: Record<string, string> = {}

    oldStepsNameToReplace.forEach((name) => {
        const newName = findUnusedName(existingNames, 'step')
        oldNameToNewName[name] = newName
        existingNames.push(newName)
    })

    const duplicatedStep = transferStep(clonedStep, (step: Step) => {
        step.displayName = `${step.displayName} Copy`
        step.name = oldNameToNewName[step.name]
        if (step.settings.inputUiInfo) {
            step.settings.inputUiInfo.currentSelectedData = undefined
            step.settings.inputUiInfo.lastTestDate = undefined
        }
        oldStepsNameToReplace.forEach((oldName) => {
            step.settings.input = applyFunctionToValuesSync(step.settings.input, (value: unknown) => {
                if (isString(value)) {
                    return replaceOldStepNameWithNewOne({ input: value, oldStepName: oldName, newStepName: oldNameToNewName[oldName] })
                }
                return value
            })
        })
        return step
    })
    let finalFlow = addAction(flowVersionWithArtifacts, {
        action: duplicatedStep as Action,
        parentStep: stepName,
        stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
    })
    const operations = getImportOperations(duplicatedStep)
    operations.forEach((operation) => {
        finalFlow = flowHelper.apply(finalFlow, operation)
    })
    return finalFlow
}

function replaceOldStepNameWithNewOne({ input, oldStepName, newStepName }: { input: string, oldStepName: string, newStepName: string }): string {
    const regex = /{{(.*?)}}/g // Regular expression to match strings inside {{ }}
    return input.replace(regex, (match, content) => {
    // Replace the content inside {{ }} using the provided function
        const replacedContent = content.replaceAll(new RegExp(`\\b${oldStepName}\\b`, 'g'), `${newStepName}`)

        // Reconstruct the {{ }} with the replaced content
        return `{{${replacedContent}}}`
    })
}

function doesActionHaveChildren(action: Action ): action  is (LoopOnItemsAction | BranchAction)   {
    const actionTypesWithChildren = [ActionType.BRANCH, ActionType.LOOP_ON_ITEMS]
    return actionTypesWithChildren.includes(action.type) 
}


function findUnusedName(names: string[], stepPrefix: string): string {
    let availableNumber = 1
    let availableName = `${stepPrefix}_${availableNumber}`

    while (names.includes(availableName)) {
        availableNumber++
        availableName = `${stepPrefix}_${availableNumber}`
    }

    return availableName
}

function findAvailableStepName(flowVersion: FlowVersion, stepPrefix: string): string {
    const steps = flowHelper
        .getAllSteps(flowVersion.trigger)
        .map((f) => f.name)
    return findUnusedName(steps, stepPrefix)
}

function getDirectParentStep(child: Step, parent: Trigger | Step | undefined): Step | Trigger | undefined {
    if (!parent) {
        return undefined
    }
    if (isTrigger(parent.type)) {
        let next = parent.nextAction
        while (next) {
            if (next.name === child.name) {
                return parent
            }
            next = next.nextAction
        }
    }
   
    if (parent.type === ActionType.BRANCH) {
           
        const isChildOfBranch = isChildOf(parent, child.name)
        if (isChildOfBranch) {
            const directTrueBranchChildren = getAllDirectChildStepsForBranch(parent, 'success')
            const directFalseBranchChildren = getAllDirectChildStepsForBranch(parent, 'failure')
            if (directTrueBranchChildren.at(-1)?.name === child.name || directFalseBranchChildren.at(-1)?.name === child.name ) {
                return parent
            }
           
            return getDirectParentStep(child, parent.onSuccessAction) ?? getDirectParentStep(child, parent.onFailureAction)       
             
        }
    }
    if (parent.type === ActionType.LOOP_ON_ITEMS) {
        const isChildOfLoop = isChildOf(parent, child.name)
        if ( isChildOfLoop) {
            const directChildren = getAllDirectChildStepsForLoop(parent)
            if (directChildren.at(-1)?.name === child.name) {
                return parent
            }
            return getDirectParentStep(child, parent.firstLoopAction)
        }
    }
    return getDirectParentStep(child, parent.nextAction)
}

function isStepLastChildOfParent(child: Step, trigger: Trigger): boolean {
  
    const parent = getDirectParentStep(child, trigger)
    if (parent) {
        if (doesStepHaveChildren(parent)) {
            if (parent.type === ActionType.LOOP_ON_ITEMS) {
                const children = getAllDirectChildStepsForLoop(parent)
                return children[children.length - 1]?.name === child.name
            }
            const trueBranchChildren = getAllDirectChildStepsForBranch(parent, 'success')
            const falseBranchChildren = getAllDirectChildStepsForBranch(parent, 'failure')
            return trueBranchChildren[trueBranchChildren.length - 1]?.name === child.name || falseBranchChildren[falseBranchChildren.length - 1]?.name === child.name
        }
        let next = parent.nextAction
        while (next) {
            if (next.nextAction === undefined && next.name === child.name) {
                return true
            }
            next = next.nextAction
        }
    }

    return false
}

function doesStepHaveChildren(step: Step): step is LoopOnItemsAction | BranchAction {
    return step.type === ActionType.BRANCH || step.type === ActionType.LOOP_ON_ITEMS
} 
export const flowHelper = {
    isValid,
    apply(
        flowVersion: FlowVersion,
        operation: FlowOperationRequest,
    ): FlowVersion {
        let clonedVersion: FlowVersion = JSON.parse(JSON.stringify(flowVersion))
        const flowBuilder = new FlowBuilder(clonedVersion)
        switch (operation.type) {
            case FlowOperationType.MOVE_ACTION:
                clonedVersion = moveAction(clonedVersion, operation.request)
                break
            case FlowOperationType.LOCK_FLOW:
                clonedVersion = flowBuilder.lockFlow().build()
                break
            case FlowOperationType.CHANGE_NAME:
                clonedVersion = flowBuilder.changeName(operation.request.displayName).build()
                break
            case FlowOperationType.DELETE_ACTION:
                clonedVersion = flowBuilder.deleteAction(operation.request).build()
                break
            case FlowOperationType.ADD_ACTION: {
                clonedVersion = flowBuilder.addAction(operation.request).build()
                break
            }
            case FlowOperationType.UPDATE_ACTION:
                clonedVersion = flowBuilder.updateAction(operation.request).build()
                break
            case FlowOperationType.UPDATE_TRIGGER:
                clonedVersion = flowBuilder.updateTrigger(operation.request).build()
                break
            case FlowOperationType.DUPLICATE_ACTION: {
                clonedVersion = duplicateStep(operation.request.stepName, clonedVersion)
                break
            }
            default:
                break
        }
        clonedVersion.valid = isValid(clonedVersion)
        return clonedVersion
    },


    getStep,
    isAction,
    isTrigger,
    getAllSteps,
    isStepLastChildOfParent,
    getUsedPieces,
    getImportOperations,
    getAllSubFlowSteps,
    getStepFromSubFlow,
    isChildOf,
    transferFlowAsync,
    getAllChildSteps,
    getAllStepsAtFirstLevel,
    duplicateStep,
    findAvailableStepName,
    doesActionHaveChildren,
 
}
