/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {BaseNode, ESNode} from 'hermes-estree';

import {getVisitorKeys, isNode} from './getVisitorKeys';
import {SimpleTraverser} from './traverse/SimpleTraverser';

export opaque type DetachedNode<+T> = T;
export type MaybeDetachedNode<+T> = T | DetachedNode<T>;

export type DetachConfig = $ReadOnly<{
  preserveLocation?: boolean,
}>;

// used by the node type function codegen
export function detachedProps<T: BaseNode>(
  parent: ?ESNode,
  props: $ReadOnly<$Partial<{...}>>,
  config: DetachConfig = {...null},
): DetachedNode<T> {
  // $FlowExpectedError[incompatible-type]
  // $FlowExpectedError[cannot-spread-inexact]
  const detachedNode: DetachedNode<T> = {
    ...props,
    ...(config?.preserveLocation !== true
      ? {
          // if this is [0,0] AND the file has a docblock then prettier will insert newlines between
          // certain detached nodes. Because of "intended" formatting behaviour (https://github.com/prettier/prettier/issues/12078)
          // this can cause us to output weirdly formatted code that should have been collapsed.
          //
          // prettier works backwards from the position you give it to find newlines or non whitespace
          // tokens and uses this to determine if newlines should be inserted between nodes.
          // By placing the range at [1, 1] we can ensure a token is always found before a newline
          // and therefore no newlines will be placed between nodes.
          //
          // NOTE: we will still run into the bug if there is weird code like a docblock with whitespace
          //       characters before it. However we assume this isn't going to happen because any file
          //       already formatted by prettier will have that whitespace removed.
          // We considered a more complex solution involving traversing the AST and manually updating
          // detached node ranges after mutations are applied - however this is a lot heavier and will
          // probably never be needed.
          range: [1, 1],
          loc: {
            start: {
              line: 1,
              column: 0,
            },
            end: {
              line: 1,
              column: 0,
            },
          },
        }
      : {}),
    // if not provided, then we purposely don't set this here
    // and will rely on the tooling to update it as appropriate.
    // nothing should be reading from this before it's set anyway.
    parent: (parent: $FlowFixMe),
  };

  return detachedNode;
}

/**
 * Shallowly clones the node, but not its children.
 */
export function shallowCloneNode<T: ESNode>(
  node: T,
  newProps: $ReadOnly<$Partial<{...}>>,
  config?: DetachConfig,
): DetachedNode<T> {
  return detachedProps(
    null,
    (Object.assign({}, node, newProps): $FlowFixMe),
    config,
  );
}

/**
 * Deeply clones node and its entire tree.
 */
export function deepCloneNode<T: ESNode>(
  node: T,
  newProps: $ReadOnly<$Partial<{...}>>,
): DetachedNode<T> {
  const clone: DetachedNode<T> = Object.assign(
    JSON.parse(
      JSON.stringify(node, (key, value) => {
        // null out parent pointers
        if (key === 'parent') {
          return undefined;
        }
        return value;
      }),
    ),
    newProps,
  );

  updateAllParentPointers(clone);

  // $FlowExpectedError[class-object-subtyping]
  return detachedProps(null, clone);
}

/**
 * Corrects the parent pointers in direct children of the given node
 */
export function setParentPointersInDirectChildren(
  node: DetachedNode<ESNode>,
): void {
  for (const key of getVisitorKeys(node)) {
    if (
      isNode(
        // $FlowExpectedError[prop-missing]
        node[key],
      )
    ) {
      node[key].parent = node;
    } else if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        child.parent = node;
      }
    }
  }
}

/**
 * Traverses the entire subtree to ensure the parent pointers are set correctly
 */
export function updateAllParentPointers(node: ESNode | DetachedNode<ESNode>) {
  SimpleTraverser.traverse(node, {
    enter(node, parent) {
      // $FlowExpectedError[cannot-write]
      node.parent = parent;
    },
    leave() {},
  });
}
