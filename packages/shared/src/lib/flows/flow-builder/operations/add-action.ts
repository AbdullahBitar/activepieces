import { AddActionRequest } from "../../flow-operations";
import { FlowVersion } from "../../flow-version";
import { addAction, transferFlow, upgradePiece } from "./flow-operation-utils";

export function addActionFlow(flow: FlowVersion, request: AddActionRequest): FlowVersion{
    flow = transferFlow(
        addAction(flow, request),
        (step) => upgradePiece(step, request.action.name),
    )
    return flow
}