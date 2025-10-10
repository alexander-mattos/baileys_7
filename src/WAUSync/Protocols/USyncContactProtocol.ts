import type { USyncQueryProtocol } from '../../Types/USync'
import { assertNodeErrorFree, type BinaryNode } from '../../WABinary'
import { USyncUser } from '../USyncUser'

export class USyncContactProtocol implements USyncQueryProtocol {
	name = 'contact'

	getQueryElement(): BinaryNode {
		return {
			tag: 'contact',
			attrs: {}
		}
	}

	getUserElement(user: USyncUser): BinaryNode {
		//TODO: Implement type / username fields (not yet supported)
		return {
			tag: 'contact',
			attrs: {},
			// content must be a string | Uint8Array | BinaryNode[]; ensure it's a string
			content: user.phone ?? ''
		}
	}

	parser(node: BinaryNode): boolean {
		if (node.tag === 'contact') {
			assertNodeErrorFree(node)
			return node?.attrs?.type === 'in'
		}

		return false
	}
}
