import { ActionType, AddActionRequest, FlowOperationRequest, FlowOperationType, FlowVersion, FlowVersionState, PackageType, PieceType, ScheduleType, TriggerType, UpdateActionRequest, flowHelper } from "../../src"
import { faker } from '@faker-js/faker';

const flowVersionWithBranching: FlowVersion = {
    'id': 'pj0KQ7Aypoa9OQGHzmKDl',
    'created': '2023-05-24T00:16:41.353Z',
    'updated': '2023-05-24T00:16:41.353Z',
    'flowId': 'lod6JEdKyPlvrnErdnrGa',
    'updatedBy': '',
    'displayName': 'Standup Reminder',
    'trigger': {
        'name': 'trigger',
        'type': TriggerType.PIECE,
        'valid': true,
        'settings': {
            'input': {
                'cronExpression': '25 10 * * 0,1,2,3,4',
            },
            'packageType': PackageType.REGISTRY,
            'pieceType': PieceType.OFFICIAL,
            'pieceName': 'schedule',
            'pieceVersion': '0.0.2',
            'inputUiInfo': {

            },
            'triggerName': 'cron_expression',
        },
        'nextAction': {
            'name': 'step_1',
            'type': 'BRANCH',
            'valid': true,
            'settings': {
                'conditions': [
                    [
                        {
                            'operator': 'TEXT_CONTAINS',
                            'firstValue': '1',
                            'secondValue': '1',
                            caseSensitive: true,
                        },
                    ],
                ],
            },
            'nextAction': {
                'name': 'step_4',
                'type': 'PIECE',
                'valid': true,
                'settings': {
                    'input': {
                        'key': '1',
                    },
                    'packageType': PackageType.REGISTRY,
                    'pieceType': PieceType.OFFICIAL,
                    'pieceName': 'store',
                    'pieceVersion': '0.2.6',
                    'actionName': 'get',
                    'inputUiInfo': {
                        'customizedInputs': {

                        },
                    },
                },
                'displayName': 'Get',
            },
            'displayName': 'Branch',
            'onFailureAction': {
                'name': 'step_3',
                'type': 'CODE',
                'valid': true,
                'settings': {
                    'input': {

                    },
                    'sourceCode': {
                        'code': 'test',
                        'packageJson': '{}',
                    },
                },
                'displayName': 'Code',
            },
            'onSuccessAction': {
                'name': 'step_2',
                'type': 'PIECE',
                'valid': true,
                'settings': {
                    'input': {
                        'content': 'MESSAGE',
                        'webhook_url': 'WEBHOOK_URL',
                    },
                    'packageType': PackageType.REGISTRY,
                    'pieceType': PieceType.OFFICIAL,
                    'pieceName': 'discord',
                    'pieceVersion': '0.2.1',
                    'actionName': 'send_message_webhook',
                    'inputUiInfo': {
                        'customizedInputs': {

                        },
                    },
                },
                'displayName': 'Send Message Webhook',
            },
        },
        'displayName': 'Cron Expression',
    },
    'valid': true,
    'state': FlowVersionState.DRAFT,
}

describe('Flow Helper', () => {

    it('should lock a flow', () => {
        const operation: FlowOperationRequest = {
            type: FlowOperationType.LOCK_FLOW,
            request: {
                flowId: flowVersionWithBranching.flowId,
            },
        }
        const result = flowHelper.apply(flowVersionWithBranching, operation)
        expect(result.state).toEqual(FlowVersionState.LOCKED)
    })

    it('should rename flow', () => {
        const newDisplayName = faker.animal.dog()
        const operation: FlowOperationRequest = {
            type: FlowOperationType.CHANGE_NAME,
            request: {
                displayName: newDisplayName
            },
        }
        const result = flowHelper.apply(flowVersionWithBranching, operation)
        expect(result.displayName).toEqual(newDisplayName)
    })

    it('should update trigger', () => {
        const request = {
            name: 'trigger',
            type: TriggerType.PIECE,
            valid: true,
            settings: {
                pieceName: '@activepieces/piece-schedule',
                pieceVersion: '~0.1.2',
                pieceType: PieceType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                triggerName: 'every_x_minutes',
                input: {
                  minutes: '1',
                },
                inputUiInfo: {},
              },
            displayName: faker.music.songName(),
        }
        const operation: FlowOperationRequest = {
            type: FlowOperationType.UPDATE_TRIGGER,
            request,
        }
        const result = flowHelper.apply(flowVersionWithBranching, operation)
        expect(result.trigger.settings).toEqual(request.settings)
        expect(result.trigger.name).toEqual(request.name)
        expect(result.trigger.type).toEqual(request.type)
        expect(result.trigger.displayName).toEqual(request.displayName)
    })

    it('should delete action', () => {
        const operation: FlowOperationRequest = {
            type: FlowOperationType.DELETE_ACTION,
            request: {
                name: 'step_1'
            },
        }
        const result = flowHelper.apply(flowVersionWithBranching, operation)
        expect(result.trigger.nextAction.settings.pieceName).toEqual("store")
    })

    it('should add action', () => {
        const request: AddActionRequest = {
            parentStep: 'trigger',
            action: {
                name: 'step_5',
                type: ActionType.CODE,
                valid: true,
                settings: {
                    input: {},
                    'sourceCode': {
                        'code': 'test',
                        'packageJson': '{}',
                    },
                },
                displayName: 'Code',
            },
        }
        const operation: FlowOperationRequest = {
            type: FlowOperationType.ADD_ACTION,
            request,
        }
        const result = flowHelper.apply(flowVersionWithBranching, operation)
        expect(result.trigger.nextAction.settings).toEqual(request.action.settings)
        expect(result.trigger.nextAction.name).toEqual(request.action.name)
        expect(result.trigger.nextAction.type).toEqual(request.action.type)
        expect(result.trigger.nextAction.displayName).toEqual(request.action.displayName)
    })

    it('should update action', () => {
        const request: UpdateActionRequest = {
            name: 'step_1',
            type: ActionType.PIECE,
            displayName: 'discord',
            valid: true,
            settings: {
                'input': {
                    'content': 'MESSAGE',
                    'webhook_url': 'WEBHOOK_URL',
                },
                'packageType': PackageType.REGISTRY,
                'pieceType': PieceType.OFFICIAL,
                'pieceName': 'discord',
                'pieceVersion': '0.2.1',
                'actionName': 'send_message_webhook',
                'inputUiInfo': {
                    'customizedInputs': {},
                },
            },
        }
        const operation: FlowOperationRequest = {
            type: FlowOperationType.UPDATE_ACTION,
            request,
        }
        const result = flowHelper.apply(flowVersionWithBranching, operation)
        expect(result.trigger.nextAction.settings).toEqual({ ...request.settings, pieceVersion: '~0.2.1'})
        expect(result.trigger.nextAction.type).toEqual(request.type)
        expect(result.trigger.nextAction.displayName).toEqual(request.displayName)
        expect(result.trigger.nextAction.valid).toEqual(request.valid)
    })

})