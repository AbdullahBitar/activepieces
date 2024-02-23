import { TypeCompiler } from "@sinclair/typebox/compiler"
import { UpdateTriggerRequest } from "../../flow-operations"
import { Trigger } from "../../triggers/trigger"
import { FlowVersion } from "../../flow-version"
import { transferFlow, upgradePiece } from "./flow-operation-utils"

const triggerSchemaValidation = TypeCompiler.Compile(Trigger)

export function addTrigger(
    flowVersion: FlowVersion,
    request: UpdateTriggerRequest,
): FlowVersion {
    const clonedVersion: FlowVersion = JSON.parse(JSON.stringify(flowVersion))
    const trigger: Trigger = {
        type: request.type,
        settings: request.settings,
        displayName: request.displayName,
        name: clonedVersion.trigger.name,
        valid: false,
        nextAction: clonedVersion.trigger.nextAction,
    }
    trigger.valid = (request.valid ?? true) && triggerSchemaValidation.Check(trigger)
    clonedVersion.trigger = trigger

    return clonedVersion
}

export function updateFlowTrigger(flowVersion: FlowVersion, request: UpdateTriggerRequest): FlowVersion {
    let updatedFlowVersion = addTrigger(flowVersion, request)

    updatedFlowVersion = transferFlow(updatedFlowVersion, (step) =>
        upgradePiece(step, request.name),
    )

    return updatedFlowVersion
}