export type UserState = {
  id: string
  color: string
  name?: string
  connectedAt: number
  lastSeenAt: number
}

export type StageClientState = {
  id: string
  connectedAt: number
  lastSeenAt: number
}

export type RoomState = {
  users: Record<string, UserState>
  stages: Record<string, StageClientState>
}

export const emptyRoomState: RoomState = {
  users: {},
  stages: {},
}

export function addUser(state: RoomState, user: UserState): RoomState {
  return {
    ...state,
    users: {
      ...state.users,
      [user.id]: user,
    },
  }
}

export function removeUser(state: RoomState, userId: string): RoomState {
  const { [userId]: _removed, ...users } = state.users

  return {
    ...state,
    users,
  }
}

export function updateUserLastSeen(
  state: RoomState,
  userId: string,
  timestamp: number,
): RoomState {
  const user = state.users[userId]

  if (!user) {
    return state
  }

  return {
    ...state,
    users: {
      ...state.users,
      [userId]: {
        ...user,
        lastSeenAt: timestamp,
      },
    },
  }
}
