import { AddActionRequest, DeleteActionRequest, UpdateActionRequest, UpdateTriggerRequest } from '../flow-operations'
import { FlowVersion, FlowVersionState } from '../flow-version'
import { addActionFlow } from './operations/add-action'
import { deleteAction } from './operations/flow-operation-utils'
import { updateActionFlow } from './operations/update-action'
import { updateFlowTrigger } from './operations/update-trigger'

export class FlowBuilder {
    private flow: FlowVersion

    constructor(flow: FlowVersion) {
        this.flow = JSON.parse(JSON.stringify(flow))
    }

    changeName(displayName: string): FlowBuilder {
        return new FlowBuilder({ ...this.flow, displayName })
    }

    lockFlow(): FlowBuilder {
        return new FlowBuilder({ ...this.flow, state: FlowVersionState.LOCKED })
    }

    updateTrigger(request: UpdateTriggerRequest): FlowBuilder {
        return new FlowBuilder(updateFlowTrigger(this.flow, request))
    }

    deleteAction(request: DeleteActionRequest): FlowBuilder {
        return new FlowBuilder(deleteAction(this.flow, request))
    }

    addAction(request: AddActionRequest): FlowBuilder {
        return new FlowBuilder(addActionFlow(this.flow, request))
    }

    updateAction(request: UpdateActionRequest): FlowBuilder {
        return new FlowBuilder(updateActionFlow(this.flow, request))
    }

    build(): FlowVersion {
        return this.flow
    }
}