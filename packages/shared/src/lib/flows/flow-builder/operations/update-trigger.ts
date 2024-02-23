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
    const trigger: Trigger = {
        type: request.type,
        settings: request.settings,
        displayName: request.displayName,
        name: flowVersion.trigger.name,
        valid: false,
        nextAction: flowVersion.trigger.nextAction,
    }
    trigger.valid = (request.valid ?? true) && triggerSchemaValidation.Check(trigger)
    flowVersion.trigger = trigger

    return flowVersion
}

export function updateFlowTrigger(flowVersion: FlowVersion, request: UpdateTriggerRequest): FlowVersion {
    let updatedFlowVersion: FlowVersion = addTrigger(flowVersion, request)

    updatedFlowVersion = transferFlow(updatedFlowVersion, (step) =>
        upgradePiece(step, request.name),
    )

    return updatedFlowVersion
}