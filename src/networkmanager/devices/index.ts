import invokeDBUS from "../../dbus"
import { NetworkManagerTypes, deviceTypes } from './../types'
import { getIpv4Settings } from './../settings'

const disableDevice = async (devicePath: string): Promise<void> => {
	return await invokeDBUS({
		destination: "org.freedesktop.NetworkManager",
		path: devicePath,
		interface: "org.freedesktop.NetworkManager.Device",
		member: "Disconnect"
	})
}

const enableDevice = async (devicePath: string): Promise<void> => {
	return await invokeDBUS({
		destination: "org.freedesktop.NetworkManager",
		path: "/org/freedesktop/NetworkManager",
		interface: "org.freedesktop.NetworkManager",
		member: "ActivateConnection",
		signature: "ooo",
		body: ["/", devicePath, "/"]
	})
}

const getWirelessDevices = async (): Promise<any[]> => {
	const devices: any[] = await getNetworkDevicesByType(2)

	const wirelessDevices = await Promise.all(
		devices.map(async (device) => {
			const [, [value]] = await invokeDBUS({
				destination: "org.freedesktop.NetworkManager",
				path: device["path"],
				interface: "org.freedesktop.DBus.Properties",
				member: "Get",
				signature: "ss",
				body: [
					"org.freedesktop.NetworkManager.Device.Wireless",
					"WirelessCapabilities"
				]
			})
			const apCapable = !!(
				value & NetworkManagerTypes.WIFI_DEVICE_CAP.AP
			)
			return { ...device, apCapable }
		})
	)

	return wirelessDevices
}

const getWiredDevices = async () => {
	return await getNetworkDevicesByType(1)
}

const getAccessPointDevices = async () => {
	return await getNetworkDevicesByType(3)
}

const getNetworkDevicesByPath = async (): Promise<string[]> => {
	return await invokeDBUS({
		destination: "org.freedesktop.NetworkManager",
		path: "/org/freedesktop/NetworkManager",
		interface: "org.freedesktop.NetworkManager",
		member: "GetDevices"
	})
}


export const getNetworkDevicesByType = async (
	type: number
): Promise<string[]> => {
	try {
		const networkDevicePaths: string[] = await getNetworkDevicesByPath()
		const devices: any = []

		await Promise.all(
			networkDevicePaths.map(async (path) => {
				const [, [deviceType]] = await invokeDBUS({
					destination: "org.freedesktop.NetworkManager",
					path: path,
					interface: "org.freedesktop.DBus.Properties",
					member: "Get",
					signature: "ss",
					body: [
						"org.freedesktop.NetworkManager.Device",
						"DeviceType"
					]
				}) // Returns Device Type 0: Unknown, 1: Ethernet, 2: WiFi, 14: Generic (Virtual)

				if (deviceType === type) {

					const [, [connectivity]] = await invokeDBUS({
						destination: "org.freedesktop.NetworkManager",
						path: path,
						interface: "org.freedesktop.DBus.Properties",
						member: "Get",
						signature: "ss",
						body: [
							"org.freedesktop.NetworkManager.Device",
							"Ip4Connectivity"
						]
					})

					const connected: boolean =
						connectivity === NetworkManagerTypes.CONNECTIVITY.FULL

					const [, [iface]]: string = await invokeDBUS({
						destination: "org.freedesktop.NetworkManager",
						path: path,
						interface: "org.freedesktop.DBus.Properties",
						member: "Get",
						signature: "ss",
						body: [
							"org.freedesktop.NetworkManager.Device",
							"Interface"
						]
					})

					const [, [driver]]: string = await invokeDBUS({
						destination: "org.freedesktop.NetworkManager",
						path: path,
						interface: "org.freedesktop.DBus.Properties",
						member: "Get",
						signature: "ss",
						body: [
							"org.freedesktop.NetworkManager.Device",
							"Driver"
						]
					})

					const typeName: string =
						Object.keys(NetworkManagerTypes.DEVICE_TYPE).find(
							(key) =>
								NetworkManagerTypes.DEVICE_TYPE[key] === type
						) || "UNKNOWN"

					const device = deviceTypes[type]

					const ipv4 = await getIpv4Settings(path)

					devices.push({
						connectivity: connected,
						path: path,
						interface: iface,
						driver: driver,
						type: typeName,
						type_literal: device,
						address: ipv4.address || null,
						prefix: ipv4.prefix || null,
						gateway: ipv4.gateway || null
					})
				}
			})
		)
		return devices
	} catch (error) {
		console.log(error)
		return []
	}
}