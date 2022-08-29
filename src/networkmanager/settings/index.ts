import invokeDBUS from "../../dbus"

const getConnectionSettings = async (networkPath: string): Promise<any[]> => {
	return await invokeDBUS({
		destination: "org.freedesktop.NetworkManager",
		path: networkPath,
		interface: "org.freedesktop.NetworkManager.Settings.Connection",
		member: "GetSettings"
	})
}

const getIpv4Settings = async (networkPath: string): Promise<{ [key: string]: string }> => {
	try {
		const [, [settingsPath]]: string = await invokeDBUS({
			destination: "org.freedesktop.NetworkManager",
			path: networkPath,
			interface: "org.freedesktop.DBus.Properties",
			member: "Get",
			signature: "ss",
			body: [
				"org.freedesktop.NetworkManager.Device",
				"Ip4Config"
			]
		})

		const [, [[ipv4AddressData]]]: [string, string][][][] = await invokeDBUS(
			{
				destination: "org.freedesktop.NetworkManager",
				path: settingsPath,
				interface: "org.freedesktop.DBus.Properties",
				member: "Get",
				signature: "ss",
				body: [
					"org.freedesktop.NetworkManager.IP4Config",
					"AddressData"
				]
			}
		)

		const [, [gateway]]: string = await invokeDBUS({
			destination: "org.freedesktop.NetworkManager",
			path: settingsPath,
			interface: "org.freedesktop.DBus.Properties",
			member: "Get",
			signature: "ss",
			body: [
				"org.freedesktop.NetworkManager.IP4Config",
				"Gateway"
			]
		})

		const [[, [, [address]]], [, [, [prefix]]]]: [string, string] = ipv4AddressData

		return ({ "address": address, "prefix": prefix, "gateway": gateway })
	}
	catch (error) {
		return { "address": "", "prefix": "", "gateway": "" }
	}
}

export {
    getConnectionSettings,
    getIpv4Settings
}