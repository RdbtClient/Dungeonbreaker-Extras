/// <reference types="../CTAutocomplete" />
/// <reference lib="es2015" />

import settings from "./settings";
import { rotateCoords } from "../tska/skyblock/dungeon/Utils";

const Vec3 = Java.type("net.minecraft.util.Vec3");
const BP = Java.type("net.minecraft.util.BlockPos");
const EnumFacing = Java.type("net.minecraft.util.EnumFacing");
const C07PacketPlayerDigging = Java.type("net.minecraft.network.play.client.C07PacketPlayerDigging");

export function nukeBlock(blockCoords) {
  const blockPos = new BP(Math.floor(blockCoords[0]), Math.floor(blockCoords[1]), Math.floor(blockCoords[2]));
  const facing = closestEnumFacing(blockPos);

  Client.sendPacket(new C07PacketPlayerDigging(C07PacketPlayerDigging.Action.START_DESTROY_BLOCK, blockPos, facing));
  Player.getPlayer().func_71038_i(); // swingItem()
  if (settings.pingless) World.getWorld().func_175698_g(blockPos); // remove client side instantly
}

export function closestEnumFacing(blockPos) {
  const player = Player.getPlayer();
  const playerEyePos = new Vec3(player.field_70165_t, player.field_70163_u + player.func_70047_e(), player.field_70161_v);

  let minDistance = Infinity;
  let closestFace = EnumFacing.UP;

  const faces = [EnumFacing.UP, EnumFacing.DOWN, EnumFacing.NORTH, EnumFacing.SOUTH, EnumFacing.EAST, EnumFacing.WEST];

  faces.forEach((face) => {
    let offsetX = 0;
    let offsetY = 0;
    let offsetZ = 0;

    switch (face) {
      case EnumFacing.DOWN:
        offsetY = -1;
        break;
      case EnumFacing.UP:
        offsetY = 1;
        break;
      case EnumFacing.NORTH:
        offsetZ = -1;
        break;
      case EnumFacing.SOUTH:
        offsetZ = 1;
        break;
      case EnumFacing.WEST:
        offsetX = -1;
        break;
      case EnumFacing.EAST:
        offsetX = 1;
        break;
    }

    const faceVec = new Vec3(blockPos.func_177958_n() + 0.5 + offsetX * 0.5, blockPos.func_177956_o() + 0.5 + offsetY * 0.5, blockPos.func_177952_p() + 0.5 + offsetZ * 0.5);
    const distance = playerEyePos.func_72438_d(faceVec); // distanceTo

    if (distance < minDistance) {
      minDistance = distance;
      closestFace = face;
    }
  });

  return closestFace;
}

export function worldToRelative(worldCoords, currentRoom) {
  if (!currentRoom) return null;
  const relative = [worldCoords[0] - currentRoom.corner[0], worldCoords[1] - currentRoom.corner[1], worldCoords[2] - currentRoom.corner[2]];
  return rotateCoords(relative, -currentRoom.rotation);
}

export function relativeToWorld(relativeCoords, currentRoom) {
  if (!currentRoom) return null;
  const rotated = rotateCoords(relativeCoords, currentRoom.rotation);
  return [rotated[0] + currentRoom.corner[0], rotated[1] + currentRoom.corner[1], rotated[2] + currentRoom.corner[2]];
}