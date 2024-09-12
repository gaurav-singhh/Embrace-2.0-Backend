import mongoose, { isValidObjectId } from "mongoose";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";

// Fetch all posts with optional filters and sorting
const getAllPosts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

  const pipeline = [];

  if (query) {
    pipeline.push({
      $search: {
        index: "search-posts",
        text: {
          query: query,
          path: ["content"],
        },
      },
    });
  }

  if (userId) {
    if (!isValidObjectId(userId)) {
      throw new ApiError(400, "Invalid userId");
    }

    pipeline.push({
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
      },
    });
  }

  pipeline.push({ $match: { isPublished: true } });

  if (sortBy && sortType) {
    pipeline.push({
      $sort: {
        [sortBy]: sortType === "asc" ? 1 : -1,
      },
    });
  } else {
    pipeline.push({ $sort: { createdAt: -1 } });
  }

  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerDetails",
        pipeline: [
          {
            $project: {
              username: 1,
              "avatar.url": 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$ownerDetails",
    }
  );

  const postAggregate = Post.aggregate(pipeline);

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const posts = await Post.aggregatePaginate(postAggregate, options);

  return res
    .status(200)
    .json(new ApiResponse(200, posts, "Posts fetched successfully"));
});

// Publish a new post
const publishAPost = asyncHandler(async (req, res) => {
  const { content, isPublished } = req.body;

  if ([content, isPublished].some((field) => field === undefined || field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const imageLocalPath = req.files?.image[0]?.path;

  if (!imageLocalPath) throw new ApiError(401, "Image is required to publish");

  const imageFile = await uploadOnCloudinary(imageLocalPath);

  if (!imageFile) throw new ApiError(500, "Failed to upload image");

  const post = await Post.create({
    content,
    image: imageFile.secure_url,
    isPublished,
    owner: req.user._id,
  });

  if (!post) throw new ApiError(500, "Failed to publish post");

  return res
    .status(201)
    .json(new ApiResponse(201, post, "Post published successfully"));
});

// Get a post by ID for guests
const getPostByIdForGuest = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  if (!postId?.trim()) throw new ApiError(400, "Post Id is missing");

  if (!isValidObjectId(postId)) throw new ApiError(400, "Invalid PostID");

  const post = await Post.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(postId),
        isPublished: true,
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "post",
        as: "likes",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "followedUser",
              as: "subscribers",
            },
          },
          {
            $addFields: {
              subscribersCount: {
                $size: "$subscribers",
              },
              isSubscribed: false,
            },
          },
          {
            $project: {
              username: 1,
              "avatar.url": 1,
              subscribersCount: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        likesCount: {
          $size: "$likes",
        },
        owner: {
          $first: "$owner",
        },
        isLiked: false,
      },
    },
    {
      $project: {
        content: 1,
        image: 1,
        views: 1,
        createdAt: 1,
        comments: 1,
        owner: 1,
        likesCount: 1,
        isLiked: 1,
        isSubscribed: 1,
      },
    },
  ]);

  if (!post.length) throw new ApiError(404, "Post not found");

  return res.status(200).json(new ApiResponse(200, post[0], "Post found"));
});

// Get a post by ID
const getPostById = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const isGuest = req.query.guest === "true";

  if (!postId?.trim()) throw new ApiError(400, "Post Id is missing");
  if (!isValidObjectId(postId)) throw new ApiError(400, "Invalid PostID");

  const post = await Post.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(postId),
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "post",
        as: "likes",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "followedUser",
              as: "subscribers",
            },
          },
          {
            $addFields: {
              subscribersCount: {
                $size: "$subscribers",
              },
              isSubscribed: {
                $cond: {
                  if: isGuest,
                  then: false,
                  else: {
                    $cond: {
                      if: {
                        $in: [req.user?._id, "$subscribers.follower"],
                      },
                      then: true,
                      else: false,
                    },
                  },
                },
              },
            },
          },
          {
            $project: {
              username: 1,
              fullName: 1,
              "avatar.url": 1,
              subscribersCount: 1,
              isSubscribed: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        likesCount: {
          $size: "$likes",
        },
        owner: {
          $first: "$owner",
        },
        isLiked: {
          $cond: {
            if: isGuest,
            then: false,
            else: {
              $cond: {
                if: { $in: [req.user?._id, "$likes.likedBy"] },
                then: true,
                else: false,
              },
            },
          },
        },
      },
    },
    {
      $project: {
        content: 1,
        image: 1,
        views: 1,
        createdAt: 1,
        comments: 1,
        owner: 1,
        likesCount: 1,
        isLiked: 1,
        isSubscribed: 1,
        subscribersCount: 1,
      },
    },
  ]);

  if (!post.length) throw new ApiError(404, "Post not found");

  return res.status(200).json(new ApiResponse(200, post[0], "Post found"));
});

// Update a post
const updatePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid postId");
  }

  const { content } = req.body;
  const imageLocalPath = req.file?.path;

  const currentPost = await Post.findById(postId);

  if (!currentPost) throw new ApiError(401, "Post cannot be found");
  if ([content].some((field) => field === undefined || field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  if (currentPost?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "You can't edit this post as you are not the owner");
  }

  let update = {
    $set: {
      content,
    },
  };

  if (imageLocalPath) {
    const imageFile = await uploadOnCloudinary(imageLocalPath);

    if (!imageFile) throw new ApiError(501, "Image uploading failed");

    await deleteFromCloudinary(currentPost?.image);

    update.$set.image = imageFile.secure_url;
  }

  const post = await Post.findByIdAndUpdate(postId, update, {
    new: true,
  });

  if (!post) throw new ApiError(501, "Updating Post failed");

  return res
    .status(200)
    .json(new ApiResponse(200, post, "Post updated successfully"));
});

// Delete a post
const deletePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const currentPost = await Post.findById(postId);

  if (!currentPost) throw new ApiError(404, "Post not found");

  const deletePost = await Post.findByIdAndDelete(postId);

  if (!deletePost) throw new ApiError(500, "Post deletion failed");

  await Promise.all([
    Like.deleteMany({ post: postId }),
    Comment.deleteMany({ post: postId }),
    deleteFromCloudinary(currentPost?.image),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Post deleted Successfully"));
});

// Toggle publish status of a post
const togglePublishStatus = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const post = await Post.findById(postId);

  if (!post) throw new ApiError(404, "Post not found");

  post.isPublished = !post.isPublished;

  await post.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, post, "Post publish status updated"));
});

// Get next posts
const getNextPosts = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) throw new ApiError(400, "Invalid postId");

  const post = await Post.findById(postId);

  if (!post) throw new ApiError(404, "Post not found");

  const nextPosts = await Post.aggregate([
    {
      $match: {
        _id: {
          $ne: new mongoose.Types.ObjectId(postId),
        },
        isPublished: true,
      },
    },
    {
      $sample: {
        size: 10,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerDetails",
        pipeline: [
          {
            $project: {
              username: 1,
              "avatar.url": 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$ownerDetails",
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, nextPosts, "Next posts fetched successfully"));
});

export {
  getAllPosts,
  publishAPost,
  getPostById,
  updatePost,
  deletePost,
  togglePublishStatus,
  getNextPosts,
  getPostByIdForGuest,
};