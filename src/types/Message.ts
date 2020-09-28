import { RosTime } from "./RosTypes";

export interface Message {
  [key: string]:  any;
}

export type ConstantsT = {[key: string]: any};

export interface MessageConstructor<T extends Message> {
  new(...args: any[]): T;
  Constants: ConstantsT;
  Resolve(msg: Partial<T>): T;
  datatype(): string;
  md5sum(): string;
  messageDefinition(): string;
  deserialize(b: Buffer, offset?: [number]): T;
  serialize(msg: T, buffer: Buffer, offset: number): void;
  getMessageSize(msg: T): number;
}

export type ServiceConstructor<Req, Resp> = {
  Request: MessageConstructor<Req>;
  Response: MessageConstructor<Resp>;
  md5sum(): string;
  datatype(): string;
}

export type MessageMap = { [key: string]: MessageConstructor<any> };
export type ServiceMap = { [key: string]: ServiceConstructor<any, any> };
export type MessageRegistryPackageEntry = { msg?: MessageMap, srv?: ServiceMap };
export type MessageRegistry = { [key: string]: MessageRegistryPackageEntry };

export interface ActionConstructor<
  Goal extends Message,
  Feedback extends Message,
  Result extends Message>
{
  Goal: MessageConstructor<Goal>;
  Cancel: MessageConstructor<ActionMsgs.GoalID>;
  Status: MessageConstructor<ActionMsgs.GoalStatusArray>;
  Feedback: MessageConstructor<Feedback>;
  Result: MessageConstructor<Result>;
  ActionGoal: MessageConstructor<ActionMsgs.ActionGoal<Goal>>;
  ActionResult: MessageConstructor<ActionMsgs.ActionResult<Result>>;
  ActionFeedback: MessageConstructor<ActionMsgs.ActionFeedback<Feedback>>;
}

export namespace StdMsgs {
  export interface Header {
    seq: number;
    stamp: RosTime;
    frame_id: string;
  }
}

export namespace ActionMsgs {
  export enum Status {
    PENDING = 0,
    ACTIVE = 1,
    PREEMPTED = 2,
    SUCCEEDED = 3,
    ABORTED = 4,
    REJECTED = 5,
    PREEMPTING = 6,
    RECALLING = 7,
    RECALLED = 8,
    LOST = 9
  }

  export interface GoalID {
    stamp: RosTime;
    id: string;
  }

  export interface GoalStatus {
    goal_id: GoalID;
    status: Status;
    text: string;
  }

  export interface GoalStatusArray {
    header: StdMsgs.Header;
    status_list: GoalStatus[];
  }

  export interface ActionGoal<T extends Message> {
    header: StdMsgs.Header;
    goal_id: GoalID;
    goal: T;
  }

  export interface ActionResult<T extends Message> {
    header: StdMsgs.Header;
    status: GoalStatus;
    result: T;
  }

  export interface ActionFeedback<T extends Message> {
    header: StdMsgs.Header;
    status: GoalStatus;
    feedback: T;
  }
}
