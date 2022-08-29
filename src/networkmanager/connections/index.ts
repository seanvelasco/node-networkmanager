import invokeDBUS from "../../dbus"
import { getConnectionSettings } from "../settings"

const connectivityStates = {
    0: "UNKNOWN",
    1: "NONE",
    2: "PORTAL",
    3: "LIMITED",
    4: "FULL"
}

const activateConnection = async (connection, path: string): Promise<void> => {
    return await invokeDBUS({
        destination: "org.freedesktop.NetworkManager",
        path: "/org/freedesktop/NetworkManager",
        interface: "org.freedesktop.NetworkManager",
        member: "ActivateConnection",
        signature: "ooo",
        body: [connection, path, "/"]
    })
}

const getActiveConnections = async (): Promise<any> => {
    const [, [activeConnections]] = await invokeDBUS({
        destination: "org.freedesktop.NetworkManager",
        path: "/org/freedesktop/NetworkManager",
        interface: "org.freedesktop.DBus.Properties",
        member: "Get",
        signature: "ss",
        body: ["org.freedesktop.NetworkManager", "ActiveConnections"]
    })

    const activeConnectionsProperties = await Promise.all(
        activeConnections.map(async (network) => {
            const [, [value]] = await invokeDBUS({
                destination: "org.freedesktop.NetworkManager",
                path: network,
                interface: "org.freedesktop.DBus.Properties",
                member: "Get",
                signature: "ss",
                body: [
                    "org.freedesktop.NetworkManager.Connection.Active",
                    "Type"
                ]
            })

            const [, [path]] = await invokeDBUS({
                destination: "org.freedesktop.NetworkManager",
                path: network,
                interface: "org.freedesktop.DBus.Properties",
                member: "Get",
                signature: "ss",
                body: [
                    "org.freedesktop.NetworkManager.Connection.Active",
                    "Connection"
                ]
            })

            if (
                value === "802-11-wireless" ||
                value === "802-3-ethernet" ||
                value === "bridge"
            ) {
                const connectionProperties = await getConnectionSettings(path)

                const [, connection] = connectionProperties.find(
                    ([setting]) => setting === "connection"
                )
                const [, [, [id]]] = connection.find(
                    ([setting]) => setting === "id"
                )

                return { name: id, type: value, path: path }
            }
        })
    )
    return activeConnectionsProperties
}

const checkConnectivity = async (): Promise<{
    [key: string]: string | number
}> => {
    const code: number = await invokeDBUS({
        destination: "org.freedesktop.NetworkManager",
        path: "/org/freedesktop/NetworkManager",
        interface: "org.freedesktop.NetworkManager",
        member: "CheckConnectivity"
    })

    return { status: connectivityStates[code], code }
}

export {
    activateConnection,
    getActiveConnections,
    checkConnectivity
}